let currentArticle = null;
let currentFiles = [];

// Verificar autenticación
if (!api.token) {
    window.location.href = '/login.html';
}

// Mostrar usuario
const user = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('username').textContent = user.username || 'Usuario';

// Cargar artículos
async function loadArticles() {
    try {
        const articles = await api.getArticles();
        renderArticlesList(articles);
    } catch (error) {
        console.error('Error loading articles:', error);
    }
}

function renderArticlesList(articles) {
    const container = document.getElementById('articlesList');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = articles.filter(article => 
        article.title.toLowerCase().includes(searchTerm)
    );
    
    container.innerHTML = filtered.map(article => `
        <div class="article-item" data-id="${article.id}">
            <strong>${escapeHtml(article.title)}</strong>
            <div style="font-size: 0.8rem; color: #718096;">
                ${new Date(article.updated_at).toLocaleDateString()}
            </div>
        </div>
    `).join('');
    
    // Agregar event listeners
    document.querySelectorAll('.article-item').forEach(el => {
        el.addEventListener('click', () => loadArticle(el.dataset.id));
    });
}

async function loadArticle(id) {
    try {
        currentArticle = await api.getArticle(id);
        currentFiles = await api.getFiles(id);
        renderArticle();
        
        // Marcar como activo en la lista
        document.querySelectorAll('.article-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.id == id) {
                el.classList.add('active');
            }
        });
    } catch (error) {
        console.error('Error loading article:', error);
    }
}

function renderArticle() {
    const container = document.getElementById('articleView');
    
    container.innerHTML = `
        <div class="article-header">
            <h2>${escapeHtml(currentArticle.title)}</h2>
            <div class="article-actions">
                <button class="btn btn-secondary" onclick="editArticle()">Editar</button>
                <button class="btn btn-danger" onclick="deleteArticle()">Eliminar</button>
            </div>
        </div>
        <div class="article-content">
            ${marked.parse(currentArticle.content || '')}
        </div>
        <div class="article-files">
            <h3>Archivos adjuntos</h3>
            <div id="filesList">
                ${renderFilesList()}
            </div>
        </div>
    `;
}

function renderFilesList() {
    if (!currentFiles || currentFiles.length === 0) {
        return '<p>No hay archivos adjuntos</p>';
    }
    
    return currentFiles.map(file => `
        <div class="file-item">
            <span>📄 ${escapeHtml(file.original_name)} (${formatFileSize(file.file_size)})</span>
            <div>
                <a href="${api.getDownloadUrl(file.id)}" target="_blank" class="btn-link">Descargar</a>
                <button onclick="deleteFile(${file.id})" class="btn-link btn-danger">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal handlers
const modal = document.getElementById('articleModal');
const newArticleBtn = document.getElementById('newArticleBtn');
const closeBtn = document.querySelector('.close');

newArticleBtn.onclick = () => {
    document.getElementById('modalTitle').textContent = 'Crear Nuevo Artículo';
    document.getElementById('articleId').value = '';
    document.getElementById('articleTitle').value = '';
    document.getElementById('articleContent').value = '';
    document.getElementById('encryptCheckbox').checked = true;
    document.getElementById('attachedFiles').innerHTML = '';
    modal.style.display = 'block';
};

closeBtn.onclick = () => {
    modal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// Guardar artículo
document.getElementById('articleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('articleId').value;
    const title = document.getElementById('articleTitle').value;
    const content = document.getElementById('articleContent').value;
    const is_encrypted = document.getElementById('encryptCheckbox').checked ? 1 : 0;
    
    const data = { title, content, is_encrypted };
    
    try {
        if (id) {
            await api.updateArticle(id, data);
        } else {
            const result = await api.createArticle(data);
            // Subir archivos si hay
            const files = document.getElementById('fileUpload').files;
            for (let file of files) {
                await api.uploadFile(file, result.id);
            }
        }
        
        modal.style.display = 'none';
        loadArticles();
        
        if (id) {
            loadArticle(id);
        }
    } catch (error) {
        alert('Error al guardar: ' + error.message);
    }
});

window.editArticle = () => {
    if (!currentArticle) return;
    
    document.getElementById('modalTitle').textContent = 'Editar Artículo';
    document.getElementById('articleId').value = currentArticle.id;
    document.getElementById('articleTitle').value = currentArticle.title;
    document.getElementById('articleContent').value = currentArticle.content;
    document.getElementById('encryptCheckbox').checked = currentArticle.is_encrypted === 1;
    document.getElementById('attachedFiles').innerHTML = '';
    modal.style.display = 'block';
};

window.deleteArticle = async () => {
    if (!currentArticle) return;
    
    if (confirm('¿Estás seguro de eliminar este artículo?')) {
        try {
            await api.deleteArticle(currentArticle.id);
            currentArticle = null;
            document.getElementById('articleView').innerHTML = `
                <div class="empty-state">
                    <p>Artículo eliminado</p>
                </div>
            `;
            loadArticles();
        } catch (error) {
            alert('Error al eliminar: ' + error.message);
        }
    }
};

window.deleteFile = async (fileId) => {
    if (confirm('¿Eliminar este archivo?')) {
        try {
            await api.deleteFile(fileId);
            currentFiles = currentFiles.filter(f => f.id !== fileId);
            renderArticle();
        } catch (error) {
            alert('Error al eliminar archivo: ' + error.message);
        }
    }
};

// Búsqueda en tiempo real
document.getElementById('searchInput').addEventListener('input', () => {
    loadArticles();
});

// Cerrar sesión
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

// Cargar datos iniciales
loadArticles();