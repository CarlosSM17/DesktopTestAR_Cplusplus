const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Directorio para almacenar logs de actividad
const LOGS_DIR = path.join(__dirname, 'activity_logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Servir archivos estáticos
app.use(express.static(__dirname));

// Ruta principal - redirigir a login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// API para registrar actividades
app.post('/api/log-activity', (req, res) => {
    try {
        const activity = req.body;
        
        // Validar datos básicos
        if (!activity.action || !activity.data) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        // Agregar timestamp del servidor
        activity.serverTimestamp = new Date().toISOString();
        activity.ip = req.ip;

        // Obtener fecha actual para el nombre del archivo
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const logFile = path.join(LOGS_DIR, `activity_${date}.json`);

        // Leer archivo existente o crear array vacío
        let logs = [];
        if (fs.existsSync(logFile)) {
            try {
                const content = fs.readFileSync(logFile, 'utf8');
                logs = JSON.parse(content);
            } catch (e) {
                console.error('Error leyendo log existente:', e);
                logs = [];
            }
        }

        // Agregar nueva actividad
        logs.push(activity);

        // Guardar actualizado
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf8');

        // También guardar por usuario para análisis individual
        if (activity.data && activity.data.userId) {
            saveUserActivity(activity);
        }

        res.json({ success: true, message: 'Actividad registrada' });

    } catch (error) {
        console.error('Error guardando actividad:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener estadísticas
app.get('/api/stats', (req, res) => {
    try {
        const stats = calculateStats();
        res.json(stats);
    } catch (error) {
        console.error('Error calculando estadísticas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener estadísticas de un usuario específico
app.get('/api/stats/user/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const stats = getUserStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Error calculando estadísticas de usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para descargar todos los logs
app.get('/api/download-logs', (req, res) => {
    try {
        const allLogs = getAllLogs();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=activity_logs.json');
        res.send(JSON.stringify(allLogs, null, 2));
    } catch (error) {
        console.error('Error descargando logs:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Funciones auxiliares

function saveUserActivity(activity) {
    const userId = activity.data.userId;
    const userLogsDir = path.join(LOGS_DIR, 'users');
    
    if (!fs.existsSync(userLogsDir)) {
        fs.mkdirSync(userLogsDir, { recursive: true });
    }

    // Sanitizar userId para nombre de archivo
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userLogFile = path.join(userLogsDir, `${safeUserId}.json`);

    let userLogs = [];
    if (fs.existsSync(userLogFile)) {
        try {
            const content = fs.readFileSync(userLogFile, 'utf8');
            userLogs = JSON.parse(content);
        } catch (e) {
            userLogs = [];
        }
    }

    userLogs.push(activity);
    fs.writeFileSync(userLogFile, JSON.stringify(userLogs, null, 2), 'utf8');
}

function getAllLogs() {
    const allLogs = [];
    
    if (!fs.existsSync(LOGS_DIR)) {
        return allLogs;
    }

    const files = fs.readdirSync(LOGS_DIR);
    
    for (const file of files) {
        if (file.startsWith('activity_') && file.endsWith('.json')) {
            try {
                const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
                const logs = JSON.parse(content);
                allLogs.push(...logs);
            } catch (e) {
                console.error(`Error leyendo ${file}:`, e);
            }
        }
    }

    return allLogs;
}

function calculateStats() {
    const logs = getAllLogs();
    
    // Estadísticas básicas
    const stats = {
        totalActivities: logs.length,
        uniqueUsers: new Set(),
        totalSessions: 0,
        exerciseViews: {},
        averageTimePerExercise: {},
        totalTimeSpent: 0,
        activeUsers: new Set(),
        lastActivity: null
    };

    logs.forEach(log => {
        if (log.data && log.data.userId) {
            stats.uniqueUsers.add(log.data.userId);
        }

        if (log.action === 'login') {
            stats.totalSessions++;
        }

        if (log.action === 'exercise_view' || log.action === 'exercise_complete') {
            const exerciseName = log.data.exerciseName || 'Desconocido';
            stats.exerciseViews[exerciseName] = (stats.exerciseViews[exerciseName] || 0) + 1;

            if (log.action === 'exercise_complete' && log.data.activeTimeSpent) {
                stats.totalTimeSpent += log.data.activeTimeSpent;
                
                if (!stats.averageTimePerExercise[exerciseName]) {
                    stats.averageTimePerExercise[exerciseName] = {
                        total: 0,
                        count: 0
                    };
                }
                stats.averageTimePerExercise[exerciseName].total += log.data.activeTimeSpent;
                stats.averageTimePerExercise[exerciseName].count++;
            }
        }

        // Última actividad
        if (!stats.lastActivity || log.timestamp > stats.lastActivity) {
            stats.lastActivity = log.timestamp;
        }
    });

    // Calcular promedios
    for (const exercise in stats.averageTimePerExercise) {
        const data = stats.averageTimePerExercise[exercise];
        stats.averageTimePerExercise[exercise] = Math.round(data.total / data.count);
    }

    stats.uniqueUsers = stats.uniqueUsers.size;

    return stats;
}

function getUserStats(userId) {
    const userLogsDir = path.join(LOGS_DIR, 'users');
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userLogFile = path.join(userLogsDir, `${safeUserId}.json`);

    if (!fs.existsSync(userLogFile)) {
        return { error: 'Usuario no encontrado' };
    }

    try {
        const content = fs.readFileSync(userLogFile, 'utf8');
        const logs = JSON.parse(content);

        const stats = {
            userId: userId,
            totalActivities: logs.length,
            sessions: 0,
            exercisesCompleted: {},
            totalTimeSpent: 0,
            firstActivity: null,
            lastActivity: null
        };

        logs.forEach(log => {
            if (log.action === 'login') {
                stats.sessions++;
            }

            if (log.action === 'exercise_complete') {
                const exerciseName = log.data.exerciseName || 'Desconocido';
                if (!stats.exercisesCompleted[exerciseName]) {
                    stats.exercisesCompleted[exerciseName] = {
                        count: 0,
                        totalTime: 0
                    };
                }
                stats.exercisesCompleted[exerciseName].count++;
                
                if (log.data.activeTimeSpent) {
                    stats.exercisesCompleted[exerciseName].totalTime += log.data.activeTimeSpent;
                    stats.totalTimeSpent += log.data.activeTimeSpent;
                }
            }

            if (!stats.firstActivity || log.timestamp < stats.firstActivity) {
                stats.firstActivity = log.timestamp;
            }

            if (!stats.lastActivity || log.timestamp > stats.lastActivity) {
                stats.lastActivity = log.timestamp;
            }
        });

        return stats;
    } catch (e) {
        console.error('Error leyendo stats de usuario:', e);
        return { error: 'Error procesando datos del usuario' };
    }
}

// Panel de administración simple
app.get('/admin', (req, res) => {
    const stats = calculateStats();
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel de Administración - Activity Tracking</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: #f5f6fa;
                padding: 20px;
                margin: 0;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            h1 {
                color: #2c3e50;
                border-bottom: 3px solid #3498db;
                padding-bottom: 10px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin: 30px 0;
            }
            .stat-card {
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .stat-value {
                font-size: 36px;
                font-weight: bold;
                color: #3498db;
            }
            .stat-label {
                color: #7f8c8d;
                margin-top: 10px;
            }
            .exercise-list {
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                margin-top: 20px;
            }
            .exercise-item {
                padding: 10px;
                border-bottom: 1px solid #ecf0f1;
                display: flex;
                justify-content: space-between;
            }
            .download-btn {
                background: #3498db;
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                margin: 10px 5px;
            }
            .download-btn:hover {
                background: #2980b9;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📊 Panel de Administración - Activity Tracking</h1>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalActivities}</div>
                    <div class="stat-label">Total de Actividades</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.uniqueUsers}</div>
                    <div class="stat-label">Usuarios Únicos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalSessions}</div>
                    <div class="stat-label">Sesiones Totales</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Math.round(stats.totalTimeSpent / 60)} min</div>
                    <div class="stat-label">Tiempo Total de Estudio</div>
                </div>
            </div>

            <div class="exercise-list">
                <h2>Ejercicios más Visitados</h2>
                ${Object.entries(stats.exerciseViews)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => `
                        <div class="exercise-item">
                            <span>${name}</span>
                            <strong>${count} visitas</strong>
                        </div>
                    `).join('')}
            </div>

            <div style="margin-top: 30px; text-align: center;">
                <a href="/api/download-logs" class="download-btn">📥 Descargar Todos los Logs</a>
                <a href="/api/stats" class="download-btn">📊 Ver Estadísticas JSON</a>
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✓ Servidor corriendo en puerto ${PORT}`);
    console.log(`✓ Panel de administración: http://localhost:${PORT}/admin`);
    console.log(`✓ Directorio de logs: ${LOGS_DIR}`);
});
