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
            
            // --- Realtime Subscription ---
            // Subscribe to all changes in the 'bulletins' table
            supabase.channel('public:bulletins')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'bulletins' }, payload => {
                    console.log('Realtime update received:', payload);
                    
                    if (payload.eventType === 'INSERT') {
                        // Optimistically or refetch. Simplest is refetch to maintain sort order.
                        // Or manually prepend:
                        // But loadBulletin handles sorting.
                        loadBulletin(); 
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedRow = payload.new;
                        
                        // Update Popup if it's currently showing this bulletin
                        // We check the content or some ID if we had stored it.
                        // Since we don't store the current popup ID in a variable accessible here easily,
                        // we can check the title or just update if the popup is visible.
                        // Better: let's store currentPopupId.
                        
                        // Update the Read Count in Popup
                        if (currentPopupId === updatedRow.id && popupReadCount) {
                            popupReadCount.textContent = `已讀: ${updatedRow.read_count || 0}`;
                        }

                        // Also refresh the list to show new content if it changed
                        loadBulletin();
                    } else if (payload.eventType === 'DELETE') {
                        loadBulletin();
                        // If popup is open for this ID, maybe close it?
                        if (currentPopupId === payload.old.id) {
                            announcementPopup.classList.add('hidden');
                        }
                    }
                })
                .subscribe();
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
    let currentPopupId = null; // Track which bulletin is currently shown in popup
    
    // --- Elements (New) ---
    const editModal = document.getElementById('edit-modal');
    const editBulletinContent = document.getElementById('edit-bulletin-content');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const closeModals = document.querySelectorAll('.close-modal');

    // Announcement Popup Elements
    const durationDaysInput = document.getElementById('duration-days');
    const durationHoursInput = document.getElementById('duration-hours');
    const announcementPopup = document.getElementById('announcement-popup');
    const closePopupBtn = document.getElementById('close-popup-btn');
    const popupContent = document.getElementById('popup-content');
    const popupTitle = document.getElementById('popup-title');
    const popupReadCount = document.getElementById('popup-read-count');

    // --- Icons Configuration ---
    const newIconSelector = document.getElementById('new-icon-selector');
    const editIconSelector = document.getElementById('edit-icon-selector');
    
    const ICONS = ['😀', '😂', '😍', '🤔', '😎', '👍', '👎', '👌', '✌️', '👋', '🐶', '🐱', '🐭', '🐰', '🦊', '📢', '🔥', '✨', '💡', '🎉'];

    function renderIcons(container, targetInput) {
        if (!container || !targetInput) return;
        container.innerHTML = '';
        ICONS.forEach(icon => {
            const span = document.createElement('span');
            span.className = 'icon-option';
            span.textContent = icon;
            span.addEventListener('click', () => {
                insertAtCursor(targetInput, icon);
            });
            container.appendChild(span);
        });
    }

    function insertAtCursor(input, text) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;
        input.value = value.substring(0, start) + text + value.substring(end);
        input.selectionStart = input.selectionEnd = start + text.length;
        input.focus();
    }

    renderIcons(newIconSelector, newBulletinInput);
    renderIcons(editIconSelector, editBulletinContent);

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

    // --- Helper Functions ---
    function parseBulletinContent(rawContent) {
        const metaRegex = /^\[META:({.*?})\]/;
        const match = rawContent.match(metaRegex);
        if (match) {
            try {
                const meta = JSON.parse(match[1]);
                const content = rawContent.replace(match[0], '');
                return { meta, content };
            } catch (e) {
                return { meta: null, content: rawContent };
            }
        }
        return { meta: null, content: rawContent };
    }

    function showBulletinPopup(bulletin, title = '公告內容') {
        if (!popupContent || !announcementPopup || !bulletin) return;
        
        currentPopupId = bulletin.id; // Store ID for realtime updates

        const { meta, content } = parseBulletinContent(bulletin.content);
        
        popupContent.innerHTML = escapeHtml(content);
        if (popupTitle) popupTitle.textContent = title;
        
        // Update Read Count Display
        let count = bulletin.read_count || 0;
        if (popupReadCount) {
            popupReadCount.textContent = `已讀: ${count}`;
        }

        announcementPopup.classList.remove('hidden');
        
        // Increment read count
        incrementReadCount(bulletin.id);
    }

    async function incrementReadCount(id) {
        // Optimistically update UI
        if (popupReadCount) {
            const currentText = popupReadCount.textContent;
            const currentCount = parseInt(currentText.replace('已讀: ', '')) || 0;
            popupReadCount.textContent = `已讀: ${currentCount + 1}`;
        }

        if (supabase) {
            // Try to increment on Supabase
            try {
                 // Try RPC first (best practice if function exists)
                 const { error: rpcError } = await supabase.rpc('increment_read_count', { row_id: id });
                 
                 if (rpcError) {
                     // Fallback: Fetch -> Update
                     const { data: current, error: fetchError } = await supabase
                        .from('bulletins')
                        .select('read_count')
                        .eq('id', id)
                        .single();
                     
                     if (!fetchError && current) {
                         const newCount = (current.read_count || 0) + 1;
                         await supabase.from('bulletins').update({ read_count: newCount }).eq('id', id);
                     }
                 }
            } catch (e) {
                console.error('Error incrementing read count:', e);
            }
        } else {
            // LocalStorage Mode
            const stored = localStorage.getItem('bulletin_messages');
            if (stored) {
                const bulletins = JSON.parse(stored);
                const index = bulletins.findIndex(b => b.id === id);
                if (index !== -1) {
                    bulletins[index].read_count = (bulletins[index].read_count || 0) + 1;
                    localStorage.setItem('bulletin_messages', JSON.stringify(bulletins));
                }
            }
        }
    }

    function checkPopup(latestBulletin) {
        if (!latestBulletin) return;
        
        const { meta, content } = parseBulletinContent(latestBulletin.content);
        
        if (meta && meta.duration) {
            const createdTime = new Date(latestBulletin.created_at).getTime();
            const durationMs = meta.duration * 60 * 60 * 1000;
            const now = Date.now();
            
            if (now < createdTime + durationMs) {
                // Show popup
                showBulletinPopup(latestBulletin, '最新公告');
            }
        }
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

    // Popup Close Button
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', () => {
            announcementPopup.classList.add('hidden');
            currentPopupId = null;
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
        if (e.target === editModal) {
            editModal.classList.add('hidden');
        }
        if (e.target === announcementPopup) {
            announcementPopup.classList.add('hidden');
            currentPopupId = null;
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
        const days = parseInt(durationDaysInput.value) || 0;
        const hours = parseInt(durationHoursInput.value) || 0;
        const totalHours = (days * 24) + hours;

        if (content) {
            let confirmMsg = '確定要發布此公告嗎？';
            if (totalHours > 0) {
                confirmMsg += `\n(提示窗將顯示 ${days} 天 ${hours} 小時)`;
            }

            if (confirm(confirmMsg)) {
                let finalContent = content;
                if (totalHours > 0) {
                    const meta = { duration: totalHours };
                    finalContent = `[META:${JSON.stringify(meta)}]${content}`;
                }
                addBulletin(finalContent);
                newBulletinInput.value = '';
                durationDaysInput.value = '';
                durationHoursInput.value = '';
                showToast();
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
            // The created_at field is automatically handled by default timezone('utc'::text, now()) in the database schema
            // which saves the current UTC time.
            const { data, error } = await supabase
                .from('bulletins')
                .insert([{ content: content, read_count: 0 }])
                .select();

            if (error) {
                alert('發布失敗: ' + error.message);
            } else {
                loadBulletin();
            }
        } else {
            // Fallback LocalStorage Mode
            // Store as ISO string (UTC) to match Supabase behavior logic
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

        // Check popup for the latest bulletin
        checkPopup(bulletins[0]);

        bulletins.forEach((msg, index) => {
            // Ensure we handle both Supabase (UTC string) and potential legacy data correctly
            // msg.created_at from Supabase is ISO string (e.g. 2023-10-27T10:00:00+00:00)
            // new Date() parses this correctly into local time
            const dateObj = new Date(msg.created_at);
            
            const date = dateObj.toLocaleString('zh-TW', {
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit',
                hour12: false // Use 24-hour format for clarity
            }); 
            
            // Parse content to separate metadata and real content
            const { meta, content } = parseBulletinContent(msg.content);

            const div = document.createElement('div');
            div.className = 'bulletin-item';
            if (index === 0) {
                div.classList.add('latest-bulletin'); // Add flashing effect to the first item
            }
            
            let adminActions = '';
            if (isAdmin) {
                // Encode content to pass safely to onclick (pass RAW content to allow editing metadata if needed)
                const encodedContent = encodeURIComponent(msg.content);
                adminActions = `
                    <div class="admin-actions">
                        <span class="edit-btn" onclick="event.stopPropagation(); openEditModal(${msg.id}, '${encodedContent}')">編輯</span>
                        <span class="delete-btn" onclick="event.stopPropagation(); deleteBulletin(${msg.id})">刪除</span>
                    </div>
                `;
            }

            // Extract summary (first line or first 20 chars)
            const lines = content.split('\n');
            const summaryText = lines[0].length > 20 ? lines[0].substring(0, 20) + '...' : lines[0];
            const hasMoreContent = content.length > lines[0].length || lines.length > 1;

            div.innerHTML = `
                <div class="bulletin-header">
                    <div class="bulletin-info">
                        ${index === 0 ? '<span class="new-tag">NEW!</span>' : ''}
                        <span class="bulletin-date">${date}</span>
                        <span class="bulletin-summary">${escapeHtml(summaryText)}</span>
                    </div>
                    ${adminActions}
                </div>
            `;
            
            // Add click event to open popup
            const header = div.querySelector('.bulletin-header');
            header.addEventListener('click', () => {
                showBulletinPopup(msg, '公告內容');
            });
            
            bulletinContent.appendChild(div);
        });
    }

    // window.toggleBulletin = function(header) { ... } // Removed as we use popup now

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
