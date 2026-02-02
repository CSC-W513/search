document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const mainContainer = document.getElementById('main-container');
    const iframeContainer = document.getElementById('iframe-container');
    const contentFrame = document.getElementById('content-frame');
    const toastMessage = document.getElementById('toast-message');
    
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const loginModal = document.getElementById('login-modal');
    const closeModal = document.querySelector('.close-modal');
    const submitLoginBtn = document.getElementById('submit-login');
    const adminPasswordInput = document.getElementById('admin-password');
    const loginError = document.getElementById('login-error');
    
    const adminControls = document.getElementById('admin-controls');
    const bulletinContent = document.getElementById('bulletin-content');
    const newBulletinInput = document.getElementById('new-bulletin');
    const postBulletinBtn = document.getElementById('post-bulletin-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    const linkCards = document.querySelectorAll('.link-card');

    // --- Supabase Configuration ---
    // 請填入您的 Supabase URL 和 Anon Key
    const SUPABASE_URL = 'https://redlpdsmixyrdssjiuco.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_rJU8W5ezktuXQVbz1nddMQ_-MtxW_16';
    
    // 初始化 Supabase
    let supabase;
    try {
        if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_KEY !== 'YOUR_SUPABASE_KEY') {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else {
            console.warn('Supabase credentials not set. Using local storage mode for demo.');
        }
    } catch (e) {
        console.error('Failed to initialize Supabase:', e);
    }

    // --- State ---
    let lastBackPressTime = 0;
    const BACK_PRESS_THRESHOLD = 2000; // 2 seconds
    let currentEditingId = null; // Track which bulletin is being edited
    
    // --- Elements (New) ---
    const editModal = document.getElementById('edit-modal');
    const editBulletinContent = document.getElementById('edit-bulletin-content');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const closeModals = document.querySelectorAll('.close-modal');

    // --- Initialization ---
    loadBulletin();
    checkLoginStatus();

    // --- Navigation ---
    linkCards.forEach(card => {
        card.addEventListener('click', () => {
            const url = card.dataset.url;
            // Open in new tab/window to ensure permissions work and satisfy "pop out new page" request
            window.open(url, '_blank');
        });
    });

    // Handle Page Visibility (Optional: Reload if needed when returning, though less critical with new tab)
    // window.addEventListener('visibilitychange', () => {
    //     if (document.visibilityState === 'visible') {
    //         // window.location.reload(); 
    //     }
    // });

    function showToast() {
        toastMessage.classList.remove('hidden');
        // Reset animation
        toastMessage.style.animation = 'none';
        toastMessage.offsetHeight; /* trigger reflow */
        toastMessage.style.animation = 'fadeInOut 2s ease-in-out';
        
        setTimeout(() => {
            toastMessage.classList.add('hidden');
        }, 2000);
    }

    // --- Admin / Bulletin Logic ---
    
    // Login Modal
    adminLoginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
        adminPasswordInput.value = '';
        loginError.classList.add('hidden');
        adminPasswordInput.focus();
    });

    closeModals.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.dataset.target;
            document.getElementById(targetId).classList.add('hidden');
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
        if (e.target === editModal) {
            editModal.classList.add('hidden');
        }
    });

    submitLoginBtn.addEventListener('click', attemptLogin);
    adminPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });

    function attemptLogin() {
        const password = adminPasswordInput.value;
        if (password === '122232') {
            setAdminMode(true);
            loginModal.classList.add('hidden');
        } else {
            loginError.classList.remove('hidden');
        }
    }

    function setAdminMode(isAdmin) {
        if (isAdmin) {
            adminControls.classList.remove('hidden');
            adminLoginBtn.classList.add('hidden');
            sessionStorage.setItem('isAdmin', 'true');
        } else {
            adminControls.classList.add('hidden');
            adminLoginBtn.classList.remove('hidden');
            sessionStorage.removeItem('isAdmin');
        }
        loadBulletin(); // Reload to show/hide admin actions
    }

    function checkLoginStatus() {
        if (sessionStorage.getItem('isAdmin') === 'true') {
            setAdminMode(true);
        }
    }

    logoutBtn.addEventListener('click', () => {
        setAdminMode(false);
    });

    // Bulletin Board
    postBulletinBtn.addEventListener('click', () => {
        const content = newBulletinInput.value.trim();
        if (content) {
            if (confirm('確定要發布此公告嗎？')) {
                addBulletin(content);
                newBulletinInput.value = '';
            }
        }
    });

    async function loadBulletin() {
        if (supabase) {
            // Supabase Mode
            const { data, error } = await supabase
                .from('bulletins')
                .select('*')
                .order('created_at', { ascending: false }); // Latest first
            
            if (error) {
                console.error('Error loading bulletins:', error);
                bulletinContent.innerHTML = '<p class="error-msg">載入失敗</p>';
                return;
            }
            renderBulletins(data);
        } else {
            // Fallback LocalStorage Mode
            const stored = localStorage.getItem('bulletin_messages');
            const bulletins = stored ? JSON.parse(stored) : [];
            // Sort by ID descending (which is timestamp)
            bulletins.sort((a, b) => b.id - a.id);
            renderBulletins(bulletins);
        }
    }

    async function addBulletin(content) {
        if (supabase) {
            // Supabase Mode
            const { data, error } = await supabase
                .from('bulletins')
                .insert([{ content: content }])
                .select();

            if (error) {
                alert('發布失敗: ' + error.message);
            } else {
                loadBulletin();
            }
        } else {
            // Fallback LocalStorage Mode
            const stored = localStorage.getItem('bulletin_messages');
            const bulletins = stored ? JSON.parse(stored) : [];
            const newMsg = {
                id: Date.now(),
                content: content,
                created_at: new Date().toISOString()
            };
            bulletins.unshift(newMsg);
            localStorage.setItem('bulletin_messages', JSON.stringify(bulletins));
            renderBulletins(bulletins);
        }
    }

    // --- Edit / Delete Logic ---
    
    window.deleteBulletin = async function(id) {
        if (!confirm('確定要刪除此公告嗎？')) return;

        if (supabase) {
            const { error } = await supabase
                .from('bulletins')
                .delete()
                .eq('id', id);
            
            if (error) {
                alert('刪除失敗: ' + error.message);
            } else {
                loadBulletin();
            }
        } else {
            const stored = localStorage.getItem('bulletin_messages');
            let bulletins = stored ? JSON.parse(stored) : [];
            bulletins = bulletins.filter(b => b.id !== id);
            localStorage.setItem('bulletin_messages', JSON.stringify(bulletins));
            loadBulletin();
        }
    };

    window.openEditModal = function(id, currentContent) {
        currentEditingId = id;
        editBulletinContent.value = decodeURIComponent(currentContent);
        editModal.classList.remove('hidden');
        editBulletinContent.focus();
    };

    saveEditBtn.addEventListener('click', async () => {
        const newContent = editBulletinContent.value.trim();
        if (!newContent) return;

        if (supabase) {
            const { error } = await supabase
                .from('bulletins')
                .update({ content: newContent })
                .eq('id', currentEditingId);

            if (error) {
                alert('修改失敗: ' + error.message);
            } else {
                editModal.classList.add('hidden');
                loadBulletin();
            }
        } else {
            const stored = localStorage.getItem('bulletin_messages');
            let bulletins = stored ? JSON.parse(stored) : [];
            const index = bulletins.findIndex(b => b.id === currentEditingId);
            if (index !== -1) {
                bulletins[index].content = newContent;
                localStorage.setItem('bulletin_messages', JSON.stringify(bulletins));
                editModal.classList.add('hidden');
                loadBulletin();
            }
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        editModal.classList.add('hidden');
    });

    function renderBulletins(bulletins) {
        bulletinContent.innerHTML = '';
        const isAdmin = sessionStorage.getItem('isAdmin') === 'true';

        if (!bulletins || bulletins.length === 0) {
            bulletinContent.innerHTML = '<p class="no-bulletin">目前無公告</p>';
            return;
        }

        bulletins.forEach((msg, index) => {
            const date = new Date(msg.created_at).toLocaleString('zh-TW', {
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit'
            }); // Compact date format
            
            const div = document.createElement('div');
            div.className = 'bulletin-item';
            if (index === 0) {
                div.classList.add('latest-bulletin'); // Add flashing effect to the first item
            }
            
            let adminActions = '';
            if (isAdmin) {
                // Encode content to pass safely to onclick
                const encodedContent = encodeURIComponent(msg.content);
                adminActions = `
                    <div class="admin-actions">
                        <span class="edit-btn" onclick="event.stopPropagation(); openEditModal(${msg.id}, '${encodedContent}')">編輯</span>
                        <span class="delete-btn" onclick="event.stopPropagation(); deleteBulletin(${msg.id})">刪除</span>
                    </div>
                `;
            }

            // Extract summary (first line or first 20 chars)
            const lines = msg.content.split('\n');
            const summaryText = lines[0].length > 20 ? lines[0].substring(0, 20) + '...' : lines[0];
            const hasMoreContent = msg.content.length > lines[0].length || lines.length > 1;

            div.innerHTML = `
                <div class="bulletin-header" onclick="toggleBulletin(this)">
                    <div class="bulletin-info">
                        ${index === 0 ? '<span class="new-tag">NEW!</span>' : ''}
                        <span class="bulletin-date">${date}</span>
                        <span class="bulletin-summary">${escapeHtml(summaryText)} ${hasMoreContent ? '<span class="more-indicator">▼</span>' : ''}</span>
                    </div>
                    ${adminActions}
                </div>
                <div class="bulletin-text hidden">${escapeHtml(msg.content)}</div>
            `;
            bulletinContent.appendChild(div);
        });
    }

    window.toggleBulletin = function(header) {
        const textDiv = header.nextElementSibling;
        const indicator = header.querySelector('.more-indicator');
        
        textDiv.classList.toggle('hidden');
        if (indicator) {
            indicator.textContent = textDiv.classList.contains('hidden') ? '▼' : '▲';
        }
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    // --- Service Worker Registration for PWA ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }
});
