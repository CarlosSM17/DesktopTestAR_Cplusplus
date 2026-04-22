// tracking.js - Sistema de monitoreo de actividad de usuario
// Este script debe ser incluido en todas las páginas de ejercicios

(function() {
    'use strict';

    // Variables globales para tracking
    let exerciseStartTime = null;
    let lastActivityTime = Date.now();
    let activityTimer = null;
    let totalTimeSpent = 0;
    let isActive = true;

    // Inicializar tracking al cargar
    window.addEventListener('load', function() {
        initializeTracking();
    });

    function initializeTracking() {
        // Verificar sesión
        const session = getSession();
        if (!session) {
            window.location.href = '../login.html';
            return;
        }

        // Obtener información del ejercicio actual
        const exerciseInfo = getCurrentExercise();
        
        // Registrar inicio del ejercicio
        exerciseStartTime = new Date();
        
        logActivity('exercise_view', {
            userId: session.userId,
            sessionId: session.sessionId,
            exerciseName: exerciseInfo.name,
            exerciseUrl: window.location.href,
            startTime: exerciseStartTime.toISOString()
        });

        // Configurar tracking de tiempo
        setupTimeTracking();
        
        // Configurar tracking de interacciones
        setupInteractionTracking();
        
        // Tracking de salida
        setupExitTracking();
    }

    function getSession() {
        try {
            const session = localStorage.getItem('userSession');
            return session ? JSON.parse(session) : null;
        } catch (e) {
            return null;
        }
    }

    function getCurrentExercise() {
        // Intentar obtener del localStorage (viene de Index.html)
        try {
            const exercise = localStorage.getItem('currentExercise');
            if (exercise) {
                return JSON.parse(exercise);
            }
        } catch (e) {}

        // Si no existe, extraer del título de la página
        const pageTitle = document.title || 'Ejercicio';
        const pagePath = window.location.pathname;
        
        return {
            name: pageTitle,
            url: pagePath
        };
    }

    function setupTimeTracking() {
        // Actualizar tiempo cada 30 segundos si hay actividad
        activityTimer = setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = (now - lastActivityTime) / 1000;

            // Solo contar tiempo si hubo actividad en los últimos 2 minutos
            if (timeSinceLastActivity < 120) {
                totalTimeSpent += 30;
                
                // Guardar checkpoint cada minuto
                if (totalTimeSpent % 60 === 0) {
                    saveTimeCheckpoint();
                }
            }
        }, 30000); // Cada 30 segundos

        // Detectar actividad del usuario
        ['mousemove', 'keydown', 'scroll', 'click'].forEach(eventType => {
            document.addEventListener(eventType, () => {
                lastActivityTime = Date.now();
                if (!isActive) {
                    isActive = true;
                    logActivity('user_active', {
                        userId: getSession()?.userId,
                        exerciseUrl: window.location.href,
                        timestamp: new Date().toISOString()
                    });
                }
            }, { passive: true });
        });

        // Detectar inactividad (tab oculto)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isActive = false;
                logActivity('user_inactive', {
                    userId: getSession()?.userId,
                    exerciseUrl: window.location.href,
                    timestamp: new Date().toISOString()
                });
            } else {
                isActive = true;
                lastActivityTime = Date.now();
            }
        });
    }

    function setupInteractionTracking() {
        // Tracking de botones (Siguiente, Reiniciar, Regresar)
        document.addEventListener('click', function(e) {
            const target = e.target;
            
            if (target.id === 'btn-next') {
                logActivity('button_click', {
                    userId: getSession()?.userId,
                    button: 'next',
                    exerciseUrl: window.location.href
                });
            } else if (target.id === 'btn-reset') {
                logActivity('button_click', {
                    userId: getSession()?.userId,
                    button: 'reset',
                    exerciseUrl: window.location.href
                });
            } else if (target.id === 'btn-return') {
                logActivity('button_click', {
                    userId: getSession()?.userId,
                    button: 'return',
                    exerciseUrl: window.location.href
                });
            }
        });
    }

    function setupExitTracking() {
        // Guardar tiempo cuando el usuario sale
        window.addEventListener('beforeunload', function(e) {
            saveExerciseSession();
        });

        // También guardar cuando cambia el foco (por si cambian de tab)
        window.addEventListener('blur', function() {
            saveTimeCheckpoint();
        });
    }

    function saveTimeCheckpoint() {
        const session = getSession();
        if (!session) return;

        const exerciseInfo = getCurrentExercise();
        
        logActivity('time_checkpoint', {
            userId: session.userId,
            sessionId: session.sessionId,
            exerciseUrl: window.location.href,
            exerciseName: exerciseInfo.name,
            timeSpent: totalTimeSpent,
            timestamp: new Date().toISOString()
        });
    }

    function saveExerciseSession() {
        const session = getSession();
        if (!session || !exerciseStartTime) return;

        const exerciseInfo = getCurrentExercise();
        const endTime = new Date();
        const totalDuration = Math.floor((endTime - exerciseStartTime) / 1000); // en segundos

        logActivity('exercise_complete', {
            userId: session.userId,
            sessionId: session.sessionId,
            exerciseUrl: window.location.href,
            exerciseName: exerciseInfo.name,
            startTime: exerciseStartTime.toISOString(),
            endTime: endTime.toISOString(),
            totalDuration: totalDuration,
            activeTimeSpent: totalTimeSpent
        });

        // Limpiar el ejercicio actual
        localStorage.removeItem('currentExercise');
    }

    function logActivity(action, data) {
        // Obtener log de actividades
        let activityLog = JSON.parse(localStorage.getItem('activityLog') || '[]');
        
        // Agregar nueva actividad
        const activity = {
            action: action,
            data: data,
            timestamp: new Date().toISOString()
        };
        
        activityLog.push(activity);
        
        // Guardar en localStorage
        localStorage.setItem('activityLog', JSON.stringify(activityLog));
        
        // Intentar enviar al servidor
        sendToServer(activity);
    }

    function sendToServer(activity) {
        // Usar navigator.sendBeacon para enviar datos incluso al cerrar
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(activity)], { type: 'application/json' });
            navigator.sendBeacon('/api/log-activity', blob);
        } else {
            // Fallback a fetch
            fetch('/api/log-activity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(activity),
                keepalive: true
            }).catch(err => {
                console.log('Offline mode: datos guardados localmente');
            });
        }
    }

    // Exponer funciones globales para uso externo si es necesario
    window.exerciseTracking = {
        logCustomEvent: function(eventName, eventData) {
            const session = getSession();
            if (session) {
                logActivity(eventName, {
                    ...eventData,
                    userId: session.userId,
                    sessionId: session.sessionId
                });
            }
        },
        getTotalTime: function() {
            return totalTimeSpent;
        }
    };

})();
