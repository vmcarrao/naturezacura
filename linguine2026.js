document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const loginScreen = document.getElementById("login-screen");
    const dashboardScreen = document.getElementById("dashboard-screen");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const logoutBtn = document.getElementById("logout-btn");
    const logoutBtnDesktop = document.getElementById("logout-btn-desktop");
    const loadingOverlay = document.getElementById("loading-overlay");
    const searchInput = document.getElementById("global-search");

    // --- HTML Escape Helper ---
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

    // --- Firebase Auth State ---
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions(); // Uses compat functions

    auth.onAuthStateChanged((user) => {
        if (user && user.email === "naturezacura@naturezacura.net") {
            loginScreen.classList.add("hidden");
            dashboardScreen.classList.remove("hidden");
            loadData(); // Load first tab
        } else {
            loginScreen.classList.remove("hidden");
            dashboardScreen.classList.add("hidden");
        }
    });

    // --- Login Actions ---
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("admin-email").value.trim();
        const password = document.getElementById("admin-password").value.trim();
        
        const btn = document.getElementById("login-btn");
        btn.textContent = "Carregando...";
        btn.disabled = true;
        loginError.classList.add("hidden");

        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            console.error(error);
            loginError.textContent = "Email ou senha incorretos, ou acesso negado.";
            loginError.classList.remove("hidden");
            auth.signOut();
        } finally {
            btn.textContent = "Entrar";
            btn.disabled = false;
        }
    });

    const logout = () => auth.signOut();
    logoutBtn.addEventListener("click", logout);
    logoutBtnDesktop.addEventListener("click", logout);

    // --- Tabs Logic ---
    let currentTab = "dashboard";
    const tabBtns = document.querySelectorAll(".tab-btn");
    
    // Store requested data to enable fast local searching
    let cachedClients = [];
    let cachedPayments = [];
    let cachedCalendar = [];

    // Charts States
    let revenueChartInstance = null;
    let bookingsChartInstance = null;

    // --- Sort & Filter State ---
    let sortState = {
        clients: { column: "date", dir: "desc" },
        payments: { column: "date", dir: "desc" }
    };
    let filterState = {
        paymentsService: new Set(),
        paymentsStatus: new Set()
    };

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Update Active State
            tabBtns.forEach(b => {
                b.classList.remove("bg-brand-green/5", "text-brand-green");
                b.classList.add("text-gray-500");
            });
            btn.classList.add("bg-brand-green/5", "text-brand-green");
            btn.classList.remove("text-gray-500");

            // Hide all tab contents
            document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
            
            // Show selected tab content
            currentTab = btn.getAttribute("data-tab");
            document.getElementById(`tab-${currentTab}`).classList.remove("hidden");
            
            // Setup content selection
            currentTab = btn.getAttribute("data-tab");
            document.getElementById(`tab-${currentTab}`).classList.remove("hidden");
            
            // Clear Search
            searchInput.value = "";
            
            // Load specific data if needed, or re-render cache
            renderCurrentTab();
        });
    });

    // Dashboard Filter Listeners
    const dashboardDateFilter = document.getElementById("dashboard-date-filter");
    const dashboardFutureFilter = document.getElementById("dashboard-future-filter");
    if(dashboardDateFilter) {
        dashboardDateFilter.addEventListener("change", () => {
            if (currentTab === "dashboard") renderCurrentTab();
        });
    }
    if(dashboardFutureFilter) {
        dashboardFutureFilter.addEventListener("change", () => {
            if (currentTab === "dashboard") renderCurrentTab();
        });
    }

    // --- Data Loaders ---
    async function loadData() {
        loadingOverlay.classList.remove("hidden");
        try {
            // Load all necessary initial data parallelly for speed
            await Promise.all([
                fetchClientsData(),
                fetchPaymentsData(),
                fetchCalendarData()
            ]);
            renderCurrentTab();
        } catch (error) {
            console.error("Error loading dashboard data:", error);
            if(error.code === 'permission-denied') {
                alert("Sessão expirada ou sem permissão. Faça login novamente.");
                auth.signOut();
            }
        } finally {
            loadingOverlay.classList.add("hidden");
        }
    }

    async function fetchClientsData() {
        // Build map to merged emails
        const clientsMap = new Map();

        // 1. Get Newsletter Subs
        const newsSnap = await db.collection("newsletter").get();
        newsSnap.forEach(doc => {
            const data = doc.data();
            clientsMap.set(data.email, {
                name: "-",
                email: data.email,
                origin: "Newsletter",
                date: data.subscribedAt ? data.subscribedAt.toDate() : new Date(),
                raw: data
            });
        });

        // 2. Get Orders (extract customer info)
        const orderSnap = await db.collection("orders").get();
        orderSnap.forEach(doc => {
            const data = doc.data();
            const em = data.customerEmail || data.clientEmail;
            if (em) {
                // Determine origin
                let origin = "Pagamento (" + (data.productName || data.type) + ")";
                
                // If exists, prefer order info over just newsletter, but keep oldest date
                if (clientsMap.has(em)) {
                    const existing = clientsMap.get(em);
                    origin = existing.origin === "Newsletter" ? origin + " + Newsletter" : existing.origin;
                }

                clientsMap.set(em, {
                    name: data.customerName || data.clientName || "-",
                    email: em,
                    origin: origin,
                    date: data.createdAt ? data.createdAt.toDate() : new Date(),
                    raw: data
                });
            }
        });

        cachedClients = Array.from(clientsMap.values()).sort((a, b) => b.date - a.date);
    }

    async function fetchPaymentsData() {
        const orderSnap = await db.collection("orders").orderBy("createdAt", "desc").get();
        cachedPayments = orderSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                date: d.createdAt ? d.createdAt.toDate() : new Date(),
                client: d.customerName || d.clientName || d.customerEmail || d.clientEmail || "Desconhecido",
                service: d.productName || d.serviceKey || "Serviço",
                amount: d.amount ? `R$ ${(d.amount / 100).toFixed(2).replace('.', ',')}` : "-",
                status: d.status || d.paymentStatus || "Pendente"
            };
        });
    }

    async function fetchCalendarData() {
        try {
            const getAdminCalendarEvents = functions.httpsCallable('getAdminCalendarEvents');
            const result = await getAdminCalendarEvents();
            const events = result.data.events || [];
            
            cachedCalendar = events.map(ev => {
                const sDate = ev.start?.dateTime ? new Date(ev.start.dateTime) : (ev.start?.date ? new Date(ev.start.date) : new Date());
                const eDate = ev.end?.dateTime ? new Date(ev.end.dateTime) : (ev.end?.date ? new Date(ev.end.date) : new Date());
                
                return {
                    id: ev.id,
                    sortDate: sDate,
                    dateStr: sDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " " + sDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour:'2-digit', minute:'2-digit' }),
                    summary: ev.summary || "Evento sem título",
                    description: ev.description || "-",
                    meetLink: ev.hangoutLink || ""
                };
            }).sort((a, b) => a.sortDate - b.sortDate); // Nearest upcoming first
        } catch (error) {
            console.error("Calendar fetch error:", error);
            cachedCalendar = [];
        }
    }

    // --- Sorting & Filtering Logic ---
    function setupInteractiveHeaders() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            // Prevent multiple bindings
            th.removeEventListener('click', handleSortClick);
            th.addEventListener('click', handleSortClick);
        });
    }

    function handleSortClick(e) {
        // Find closest TH in case they clicked the icon
        const th = e.target.closest('th');
        if (!th) return;

        const column = th.getAttribute("data-sort");
        const tab = currentTab;
        
        // Toggle direction
        if (sortState[tab].column === column) {
            sortState[tab].dir = sortState[tab].dir === "asc" ? "desc" : "asc";
        } else {
            sortState[tab].column = column;
            sortState[tab].dir = "asc"; // Default new sort to asc
        }

        // Update visual icons
        updateSortIcons(tab);
        renderCurrentTab(searchInput.value);
    }

    function updateSortIcons(tab) {
        const tableId = tab === "clients" ? "tab-clients" : "tab-payments";
        const headers = document.querySelectorAll(`#${tableId} th[data-sort]`);
        
        headers.forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;

            const col = th.getAttribute("data-sort");
            // Reset all to base neutral state
            icon.className = "fa-solid fa-sort ml-1 text-gray-300 group-hover:text-gray-500 transition sort-icon relative z-0";
            
            // Highlight active sort
            if (col === sortState[tab].column) {
                if (sortState[tab].dir === "asc") {
                    icon.className = "fa-solid fa-sort-up ml-1 text-brand-green sort-icon relative z-0";
                } else {
                    icon.className = "fa-solid fa-sort-down ml-1 text-brand-green sort-icon relative z-0";
                }
            }
        });
    }

    function applySorting(dataArray, tab) {
        const { column, dir } = sortState[tab];
        return dataArray.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Handle amount string parsing "R$ 150,00" -> 150.00
            if (column === "amount") {
                valA = parseFloat(valA.replace("R$ ", "").replace(".", "").replace(",", "."));
                valB = parseFloat(valB.replace("R$ ", "").replace(".", "").replace(",", "."));
            }

            // Handle strings
            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();

            if (valA < valB) return dir === "asc" ? -1 : 1;
            if (valA > valB) return dir === "asc" ? 1 : -1;
            return 0;
        });
    }

    // --- Excel-Style Checkbox Filters ---
    function setupFilters() {
        if (currentTab !== "payments") return;
        
        // Extract unique options from current data
        const services = [...new Set(cachedPayments.map(p => p.service))].sort();
        const statuses = [...new Set(cachedPayments.map(p => p.status))].sort();

        renderFilterDropdown("service", services, filterState.paymentsService);
        renderFilterDropdown("status", statuses, filterState.paymentsStatus);
    }

    function renderFilterDropdown(filterKey, options, activeSet) {
        const btn = document.getElementById(`filter-btn-${filterKey}`);
        const dropdown = document.getElementById(`filter-dropdown-${filterKey}`);
        if (!btn || !dropdown) return;

        let html = `<div class="flex flex-col gap-1">`;
        options.forEach(opt => {
            const isChecked = activeSet.has(opt) ? "checked" : "";
            const optId = `filter-${filterKey}-${esc(opt).replace(/\s+/g, '-')}`;
            html += `
                <label for="${optId}" class="flex items-center gap-2 px-2 py-1 text-xs text-gray-600 hover:bg-green-50 rounded cursor-pointer transition">
                    <input type="checkbox" id="${optId}" value="${esc(opt)}" class="filter-checkbox-${filterKey} rounded border-gray-300 text-brand-green focus:ring-brand-green" ${isChecked}>
                    ${esc(opt)}
                </label>
            `;
        });
        html += `
            </div>
            <div class="mt-2 pt-2 border-t border-gray-100 flex justify-between">
                <button type="button" class="text-xs text-gray-500 hover:text-gray-700" id="clear-${filterKey}-btn">Limpar</button>
                <button type="button" class="text-xs bg-brand-green text-white px-3 py-1 rounded" id="apply-${filterKey}-btn">Aplicar</button>
            </div>
        `;
        dropdown.innerHTML = html;

        // Toggle dropdown listener (removing old ones to prevent stacking)
        const toggleDropdown = (e) => {
            e.stopPropagation();
            document.querySelectorAll('[id^="filter-dropdown-"]').forEach(d => {
                if (d.id !== dropdown.id) d.classList.add('hidden'); // Close others
            });
            dropdown.classList.toggle('hidden');
        };
        
        // Remove old listener if exists, then attach
        btn.removeEventListener('click', btn._toggleHandler);
        btn._toggleHandler = toggleDropdown;
        btn.addEventListener('click', toggleDropdown);

        // Prevent clicking inside dropdown from closing it
        dropdown.addEventListener('click', e => e.stopPropagation());

        // Button Actions
        document.getElementById(`apply-${filterKey}-btn`).addEventListener('click', () => {
            activeSet.clear();
            document.querySelectorAll(`.filter-checkbox-${filterKey}:checked`).forEach(cb => {
                activeSet.add(cb.value);
            });
            dropdown.classList.add('hidden');
            renderCurrentTab(searchInput.value); // Re-render table!
        });

        document.getElementById(`clear-${filterKey}-btn`).addEventListener('click', () => {
            activeSet.clear();
            document.querySelectorAll(`.filter-checkbox-${filterKey}`).forEach(cb => cb.checked = false);
            dropdown.classList.add('hidden');
            renderCurrentTab(searchInput.value);
        });
    }

    // Close dropdowns if clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('[id^="filter-dropdown-"]').forEach(d => d.classList.add('hidden'));
    });

    // --- Analytics Dashboard Logic ---
    function getFilterStartDate(filterVal) {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        if (filterVal === "this_month") {
            return new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (filterVal === "last_month") {
            return new Date(today.getFullYear(), today.getMonth() - 1, 1);
        } else {
            const days = parseInt(filterVal);
            const start = new Date(today);
            start.setDate(today.getDate() - days);
            return start;
        }
    }

    function getFilterEndDate(filterVal) {
        const today = new Date();
        today.setHours(23,59,59,999);
        
        if (filterVal === "last_month") {
            return new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        }
        return today;
    }

    function renderDashboard() {
        const dateFilter = document.getElementById("dashboard-date-filter").value;
        const futureFilter = parseInt(document.getElementById("dashboard-future-filter").value);

        const startDate = getFilterStartDate(dateFilter);
        const endDate = getFilterEndDate(dateFilter);

        // 1. Total Money Earned & Paying Clients
        let totalRevenue = 0;
        const payingClientsSet = new Set();
        const revenueByDate = {}; // { 'DD/MM/YYYY': value }

        cachedPayments.forEach(p => {
            if (p.date >= startDate && p.date <= endDate) {
                if (p.status === "paid" || p.status === "Paid" || p.status === "booked") {
                    const val = parseFloat(p.amount.replace("R$ ", "").replace(".", "").replace(",", "."));
                    if (!isNaN(val)) {
                        totalRevenue += val;
                        const dStr = p.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                        revenueByDate[dStr] = (revenueByDate[dStr] || 0) + val;
                    }
                    payingClientsSet.add(p.client); 
                }
            }
        });

        document.getElementById("kpi-clients").innerText = payingClientsSet.size;
        document.getElementById("kpi-revenue").innerText = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;

        // Render Revenue Chart
        if (revenueChartInstance) revenueChartInstance.destroy();
        const revCtx = document.getElementById('revenueChart').getContext('2d');
        
        // Sort dates chronologically for the chart
        const revDates = Object.keys(revenueByDate).sort((a,b) => {
            const pa = a.split('/');
            const pb = b.split('/');
            return new Date(pa[2], pa[1]-1, pa[0]) - new Date(pb[2], pb[1]-1, pb[0]);
        });
        const revData = revDates.map(d => revenueByDate[d]);

        revenueChartInstance = new Chart(revCtx, {
            type: 'line',
            data: {
                labels: revDates.length > 0 ? revDates : ['Sem Dados'],
                datasets: [{
                    label: 'Receita Diária (R$)',
                    data: revData.length > 0 ? revData : [0],
                    borderColor: '#1A3C34',
                    backgroundColor: 'rgba(26, 60, 52, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#1A3C34'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { borderDash: [2,4] } },
                    x: { grid: { display: false } }
                }
            }
        });

        // 2. Future Bookings
        const today = new Date();
        today.setHours(0,0,0,0);
        const futureEnd = new Date(today);
        futureEnd.setDate(today.getDate() + futureFilter);

        let futureCount = 0;
        const bookingsByDate = {}; 
        
        // Pre-fill days to show zero-book days explicitly
        for(let i=0; i<=futureFilter; i++) {
            let d = new Date(today);
            d.setDate(today.getDate() + i);
            bookingsByDate[d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })] = 0;
        }

        cachedCalendar.forEach(ev => {
            if (ev.sortDate >= today && ev.sortDate <= futureEnd) {
                futureCount++;
                const dStr = ev.sortDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                if (bookingsByDate[dStr] !== undefined) {
                    bookingsByDate[dStr]++;
                } else {
                    bookingsByDate[dStr] = 1;
                }
            }
        });

        document.getElementById("kpi-future-bookings").innerText = futureCount;

        // Render Bookings Chart
        if (bookingsChartInstance) bookingsChartInstance.destroy();
        const bookCtx = document.getElementById('bookingsChart').getContext('2d');
        
        const bookDates = Object.keys(bookingsByDate).sort((a,b) => {
            const pa = a.split('/');
            const pb = b.split('/');
            return new Date(pa[2], pa[1]-1, pa[0]) - new Date(pb[2], pb[1]-1, pb[0]);
        });
        const bookData = bookDates.map(d => bookingsByDate[d]);

        bookingsChartInstance = new Chart(bookCtx, {
            type: 'bar',
            data: {
                labels: bookDates,
                datasets: [{
                    label: 'Agendamentos',
                    data: bookData,
                    backgroundColor: '#1A3C34',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { borderDash: [2,4] } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }
                }
            }
        });
    }

    // --- Rendering ---
    function renderCurrentTab(filterQuery = "") {
        const q = filterQuery.toLowerCase();
        setupInteractiveHeaders();
        setupFilters();
        
        if (currentTab === "dashboard") {
            renderDashboard();
        }
        else if (currentTab === "clients") {
            const tbody = document.getElementById("clients-tbody");
            tbody.innerHTML = "";
            let data = [...cachedClients]; // Clone to sort safely
            if (q) data = data.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.origin.toLowerCase().includes(q));
            
            data = applySorting(data, "clients");
            
            data.forEach((c, index) => {
                const tr = document.createElement("tr");
                tr.className = "cursor-pointer hover:bg-gray-50 transition group";
                
                tr.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-chevron-right text-xs text-gray-300 group-hover:text-brand-green transition transform" id="chevron-client-${index}"></i>
                            <div>
                                <div class="font-medium text-brand-green">${esc(c.name)}</div>
                                <div class="text-xs text-gray-500">${esc(c.email)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-gray-600">${esc(c.origin)}</td>
                    <td class="px-6 py-4 text-gray-400 text-xs">${c.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                `;

                // Hidden Expansion Row
                const expTr = document.createElement("tr");
                expTr.id = `expand-client-${index}`;
                expTr.className = "hidden bg-gray-50/50 border-b border-gray-100";
                const expTd = document.createElement("td");
                expTd.colSpan = 3;
                expTd.className = "px-6 py-4";
                const expDiv = document.createElement("div");
                expDiv.className = "p-4 bg-white border border-gray-200 rounded text-xs text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap";
                expDiv.textContent = JSON.stringify(c.raw, null, 2);
                expTd.appendChild(expDiv);
                expTr.appendChild(expTd);

                // Toggle Logic
                tr.addEventListener("click", () => {
                    const isHidden = expTr.classList.contains("hidden");
                    const icon = document.getElementById(`chevron-client-${index}`);
                    
                    if(isHidden) {
                        expTr.classList.remove("hidden");
                        icon.classList.add("rotate-90");
                    } else {
                        expTr.classList.add("hidden");
                        icon.classList.remove("rotate-90");
                    }
                });

                tbody.appendChild(tr);
                tbody.appendChild(expTr);
            });
            if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-400">Nenhum cliente encontrado.</td></tr>`;
        } 
        else if (currentTab === "payments") {
            const tbody = document.getElementById("payments-tbody");
            tbody.innerHTML = "";
            let data = [...cachedPayments];
            
            // Text Search
            if (q) data = data.filter(p => p.client.toLowerCase().includes(q) || p.service.toLowerCase().includes(q) || p.status.toLowerCase().includes(q));
            
            // Excel Checkbox Filters
            if (filterState.paymentsService.size > 0) {
                data = data.filter(p => filterState.paymentsService.has(p.service));
            }
            if (filterState.paymentsStatus.size > 0) {
                data = data.filter(p => filterState.paymentsStatus.has(p.status));
            }

            data = applySorting(data, "payments");

            data.forEach(p => {
                const statusColor = p.status === "paid" || p.status === "Paid" ? "bg-green-100 text-green-700" : 
                                  p.status === "booked" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700";
                const tfStatus = p.status === "paid" || p.status === "Paid" ? "Pago" : 
                                 p.status === "booked" ? "Agendado" : 
                                 p.status === "expired" ? "Expirado" : "Pendente";

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="px-6 py-4 text-gray-500 text-xs">${p.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td class="px-6 py-4 font-medium text-brand-green">${esc(p.client)}</td>
                    <td class="px-6 py-4 text-gray-600">${esc(p.service)}</td>
                    <td class="px-6 py-4 font-medium">${p.amount}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-xs font-medium ${statusColor}">${tfStatus}</span>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            if(data.length === 0) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400">Nenhum pagamento encontrado.</td></tr>`;
        } 
        else if (currentTab === "calendar") {
            const container = document.getElementById("tab-calendar");
            container.innerHTML = ""; // Clear existing table structure completely
            
            let data = cachedCalendar;
            if (q) data = data.filter(ev => ev.summary.toLowerCase().includes(q) || ev.description.toLowerCase().includes(q));

            if(data.length === 0) {
                container.innerHTML = `<div class="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 shadow-sm">Nenhum evento futuro encontrado.</div>`;
                return;
            }

            // Group events by date (YYYY-MM-DD string)
            const grouped = {};
            data.forEach(ev => {
                const dateKey = ev.sortDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                if(!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(ev);
            });

            // Build robust List/Grid layout
            const calendarWrapper = document.createElement("div");
            calendarWrapper.className = "bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100 max-w-6xl mx-auto";

            for (const [dateStr, events] of Object.entries(grouped)) {
                // Determine day of week
                const dList = dateStr.split('/');
                const dObj = new Date(dList[2], dList[1]-1, dList[0]);
                const weekDay = dObj.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: 'long' });
                const capitalizedWeekDay = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);

                // Calculate daily revenue from matching payments
                let dailyRevenue = 0;
                let hasRevenue = false;
                
                cachedPayments.forEach(p => {
                    if (p.status === "paid" || p.status === "Paid" || p.status === "booked") {
                        const payDateStr = p.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                        if (payDateStr === dateStr) {
                            const val = parseFloat(p.amount.replace("R$ ", "").replace(".", "").replace(",", "."));
                            if (!isNaN(val)) {
                                dailyRevenue += val;
                                hasRevenue = true;
                            }
                        }
                    }
                });

                const revenueTag = hasRevenue 
                    ? `<div class="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-green/10 text-brand-green font-medium rounded-md text-xs border border-brand-green/20"><i class="fa-solid fa-money-bill-wave"></i> R$ ${dailyRevenue.toFixed(2).replace('.', ',')}</div>`
                    : '';

                const daySection = document.createElement("div");
                daySection.className = "flex flex-col lg:flex-row gap-6 p-6 lg:p-8 hover:bg-gray-50/50 transition duration-300";

                // Left Column: Date Label
                const dateHeader = document.createElement("div");
                dateHeader.className = "w-full lg:w-48 flex-shrink-0 flex flex-col items-start";
                dateHeader.innerHTML = `
                    <div class="text-xs text-brand-green uppercase tracking-widest font-semibold mb-1">${capitalizedWeekDay}</div>
                    <div class="text-3xl font-serif text-gray-900 flex items-baseline gap-2">
                        ${dList[0]}
                        <span class="text-sm font-sans text-gray-400 font-medium lowercase">${dObj.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month:'short' }).replace('.', '')}</span>
                    </div>
                    ${revenueTag}
                `;

                // Right Column: Event Blocks (CSS Grid)
                const eventsWrapper = document.createElement("div");
                eventsWrapper.className = "flex-1 grid grid-cols-1 xl:grid-cols-2 gap-4";

                events.forEach(ev => {
                    const timeStr = ev.sortDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour:'2-digit', minute:'2-digit' });
                    const isAllDay = timeStr === "00:00";

                    const safeMeetLink = ev.meetLink && /^https:\/\/meet\.google\.com\//.test(ev.meetLink) ? ev.meetLink : null;
                    const meetBtn = safeMeetLink ? `<a href="${safeMeetLink}" target="_blank" class="mt-4 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-md text-xs font-semibold text-blue-700 hover:bg-blue-100 transition w-full md:w-auto shadow-sm"><i class="fa-solid fa-video"></i> Entrar na Reunião</a>` : '';

                    const eventCard = document.createElement("div");
                    eventCard.className = "bg-white border border-gray-100 p-5 rounded-xl shadow-sm hover:shadow-md transition flex flex-col justify-between relative group";

                    eventCard.innerHTML = `
                        <div class="absolute top-0 left-0 w-1 h-full bg-brand-green rounded-l-xl"></div>
                        <div class="pl-2">
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <span class="inline-flex text-xs font-medium text-brand-green bg-brand-green/5 px-2 py-1 rounded gap-1.5 items-center">
                                    <i class="fa-regular fa-clock"></i> ${isAllDay ? 'O dia todo' : timeStr}
                                </span>
                            </div>
                            <h3 class="font-semibold text-gray-800 text-base leading-snug">${esc(ev.summary)}</h3>
                            ${ev.description && ev.description !== "-" ? `<p class="text-sm text-gray-500 mt-2 line-clamp-3 leading-relaxed">${esc(ev.description)}</p>` : ''}
                        </div>
                        <div class="pl-2">${meetBtn}</div>
                    `;
                    eventsWrapper.appendChild(eventCard);
                });

                daySection.appendChild(dateHeader);
                daySection.appendChild(eventsWrapper);
                calendarWrapper.appendChild(daySection);
            }

            container.appendChild(calendarWrapper);
        }
    }

    // --- Search Logic ---
    searchInput.addEventListener("input", (e) => {
        renderCurrentTab(e.target.value);
    });
});
