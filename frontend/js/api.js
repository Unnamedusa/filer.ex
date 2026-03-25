const API_BASE = '/api';

class API {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en la petición');
        }

        return response.json();
    }

    async login(username, password) {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        return response.json();
    }

    async register(username, password) {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        return response.json();
    }

    async getArticles() {
        return this.request('/articles');
    }

    async getArticle(id) {
        return this.request(`/articles/${id}`);
    }

    async createArticle(data) {
        return this.request('/articles', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateArticle(id, data) {
        return this.request(`/articles/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteArticle(id) {
        return this.request(`/articles/${id}`, {
            method: 'DELETE'
        });
    }

    async uploadFile(file, articleId = null) {
        const formData = new FormData();
        formData.append('file', file);
        if (articleId) {
            formData.append('article_id', articleId);
        }

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        return response.json();
    }

    async getFiles(articleId) {
        return this.request(`/files/${articleId}`);
    }

    getDownloadUrl(fileId) {
        return `${API_BASE}/download/${fileId}?token=${this.token}`;
    }

    async deleteFile(fileId) {
        return this.request(`/files/${fileId}`, {
            method: 'DELETE'
        });
    }
}

const api = new API();