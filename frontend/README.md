# CyberSnake frontend – folder structure

player.html / admin.html   -> only load js/pages/<x>/<x>Page.js (+ your existing css/style.css)

js/config/       constants & API base URL
js/utils/        tiny helpers ($, showMsg, time/podium, sleep)
js/api/          every backend call (like "routes"): gameApi, questionApi, bonusApi, adminApi, botApi, http.js
js/state/        shared mutable state (playerState, adminState)
js/services/     non-UI logic: socketService, botManager, audio/ (engine, synth, sfx, bgm)
js/components/   reusable UI pieces: board/ (SVG board, tokens, FX), player/ (dice, quizzes, bonus, inventory...), admin/ (roster, presets, bots...)
js/pages/        entry points that wire components together: player/ (playerPage, polling, roll), admin/ (adminPage, session)

Delete the old flat files: js/playerApp.js, adminApp.js, apiService.js, boardData.js, audioService.js, config.js, socketService.js, botManager.js
