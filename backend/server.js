const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB límite
});

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Funciones de encriptación
const encrypt = (text) => {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedText) => {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// ============ RUTAS DE AUTENTICACIÓN ============
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword],
            function(err) {
                if (err) {
                    return res.status(400).json({ error: 'Usuario ya existe' });
                }
                res.json({ message: 'Usuario creado exitosamente' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            token, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    });
});

// ============ RUTAS DE ARTÍCULOS ============
app.get('/api/articles', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, title, created_at, updated_at FROM articles ORDER BY updated_at DESC',
        (err, articles) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(articles);
        }
    );
});

app.get('/api/articles/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM articles WHERE id = ?', [req.params.id], (err, article) => {
        if (err || !article) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }
        
        // Desencriptar si está encriptado
        if (article.is_encrypted) {
            try {
                article.content = decrypt(article.content);
            } catch (e) {
                article.content = '[Contenido encriptado - error al desencriptar]';
            }
        }
        
        res.json(article);
    });
});

app.post('/api/articles', authenticateToken, (req, res) => {
    const { title, content, is_encrypted = 1 } = req.body;
    
    let finalContent = content;
    if (is_encrypted) {
        finalContent = encrypt(content);
    }
    
    db.run(
        'INSERT INTO articles (title, content, is_encrypted, user_id) VALUES (?, ?, ?, ?)',
        [title, finalContent, is_encrypted, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, message: 'Artículo creado' });
        }
    );
});

app.put('/api/articles/:id', authenticateToken, (req, res) => {
    const { title, content, is_encrypted } = req.body;
    
    let finalContent = content;
    if (is_encrypted) {
        finalContent = encrypt(content);
    }
    
    db.run(
        'UPDATE articles SET title = ?, content = ?, is_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, finalContent, is_encrypted, req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Artículo actualizado' });
        }
    );
});

app.delete('/api/articles/:id', authenticateToken, (req, res) => {
    // Primero eliminar archivos asociados
    db.run('DELETE FROM files WHERE article_id = ?', [req.params.id]);
    db.run('DELETE FROM articles WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Artículo eliminado' });
    });
});

// ============ RUTAS DE ARCHIVOS ============
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo' });
    }
    
    const { article_id } = req.body;
    
    db.run(
        `INSERT INTO files (filename, original_name, file_path, file_size, mime_type, user_id, article_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.file.filename, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, req.user.id, article_id || null],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ 
                id: this.lastID,
                filename: req.file.filename,
                original_name: req.file.originalname,
                message: 'Archivo subido exitosamente'
            });
        }
    );
});

app.get('/api/files/:articleId', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, filename, original_name, file_size, mime_type, created_at FROM files WHERE article_id = ?',
        [req.params.articleId],
        (err, files) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(files);
        }
    );
});

app.get('/api/download/:fileId', authenticateToken, (req, res) => {
    db.get('SELECT * FROM files WHERE id = ?', [req.params.fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.download(file.file_path, file.original_name);
    });
});

app.delete('/api/files/:fileId', authenticateToken, (req, res) => {
    db.get('SELECT * FROM files WHERE id = ?', [req.params.fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        
        // Eliminar archivo físico
        const fs = require('fs');
        fs.unlink(file.file_path, (err) => {
            if (err) console.error('Error al eliminar archivo físico:', err);
        });
        
        db.run('DELETE FROM files WHERE id = ?', [req.params.fileId], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Archivo eliminado' });
        });
    });
});

// Servir archivos estáticos
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('Credenciales por defecto: admin / admin123');
});