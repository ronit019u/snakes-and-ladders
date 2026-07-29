const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const SESSION_FILE = path.join(__dirname, '../session.json');

function initSessionFile() {
    if (!fs.existsSync(SESSION_FILE)) {
        fs.writeFileSync(SESSION_FILE, JSON.stringify({}), 'utf-8');
    }
}
initSessionFile();

function readSessions() {
    try {
        const data = fs.readFileSync(SESSION_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

function writeSessions(sessions) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

class FileStore extends EventEmitter {
    constructor() {
        super();
    }

    get(sid, callback) {
        try {
            const sessions = readSessions();
            const session = sessions[sid] || null;
            if (typeof callback === 'function') {
                callback(null, session);
            }
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err);
            }
        }
    }

    set(sid, session, callback) {
        try {
            const sessions = readSessions();
            sessions[sid] = session;
            writeSessions(sessions);
            if (typeof callback === 'function') {
                callback(null);
            }
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err);
            }
        }
    }

    destroy(sid, callback) {
        try {
            const sessions = readSessions();
            delete sessions[sid];
            writeSessions(sessions);
            if (typeof callback === 'function') {
                callback(null);
            }
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err);
            }
        }
    }

    touch(sid, session, callback) {
        try {
            const sessions = readSessions();
            if (sessions[sid]) {
                sessions[sid] = session;
                writeSessions(sessions);
            }
            if (typeof callback === 'function') {
                callback(null);
            }
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err);
            }
        }
    }

    // express-session 需要这个方法
    createSession(sid, session, callback) {
        this.set(sid, session, callback);
    }
}

module.exports = FileStore;