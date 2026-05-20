import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, addDoc, setDoc, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Config Firebase — inline en cada archivo, NO importar desde firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyDSjlHVAIWy8LiPaoD31biyTQ3W_UdL5us",
  authDomain: "lacteos-elmilagro.firebaseapp.com",
  projectId: "lacteos-elmilagro",
  storageBucket: "lacteos-elmilagro.firebasestorage.app",
  messagingSenderId: "1048870846106",
  appId: "1:1048870846106:web:4b0071677f22f80b12a923"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ZONAS Y SUCURSALES — HARDCODEADAS, NO CAMBIAR
const ZONAS = [
  { zona: 'Zona Norte',  barrios: ['Bolivia', 'Tres Cerritos'], sucursal: 'Sucursal Bolivia' },
  { zona: 'Zona Sur',    barrios: ['Chile', 'Inter'],           sucursal: 'Sucursal Chile' },
  { zona: 'Zona Este',   barrios: ['Artigas'],                  sucursal: 'Sucursal Artigas' },
  { zona: 'Zona Centro', barrios: ['Arenales', 'Mendoza'],      sucursal: 'Sucursal Arenales' },
  { zona: 'Zona Oeste',  barrios: ['Arenales', 'Mendoza'],      sucursal: 'Sucursal Arenales' },
  { zona: 'Orán',        barrios: ['Todo Orán'],                sucursal: 'Sucursal Orán' },
];

/**
 * IMPORTANTE: Si los productos no cargan (Error de Red/CORS), 
 * debés configurar CORS en tu bucket de Firebase Storage usando gsutil.
 */
const STORAGE_BASE_URL = 'https://firebasestorage.googleapis.com/v0/b/lacteos-elmilagro.firebasestorage.app/o/catalog%2F';

let products = [];           
let allCategories = [];      
let currentCategory = 'all'; 
let searchQuery = '';        
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let serverVersions = {};     

// Elementos DOM
const productContainer = document.getElementById('productContainer');
const featuredContainer = document.getElementById('featuredContainer');
const featuredSection = document.getElementById('featuredSection');
const categoryContainer = document.getElementById('categoryContainer');
const cartBadge = document.getElementById('cartBadge');
const cartSidebar = document.getElementById('cartSidebar');
const cartItemsContainer = document.getElementById('cartItemsContainer');
const cartTotalText = document.getElementById('cartTotalText');
const checkoutBtn = document.getElementById('checkoutBtn');
const productModal = document.getElementById('productModal');
const checkoutModal = document.getElementById('checkoutModal');
const toastMessage = document.getElementById('toastMessage');

// --- INICIO APP ---
async function initApp() {
  cleanCorruptedCache();
  initTheme();
  renderCart();
  setupEventListeners();
  await loadCatalogMeta();    // 1 sola lectura Firestore
  await loadCategories();     // Cargar categorías (orden local)
  await loadCategoryProducts('all'); // Cargar catálogo desde Storage
}

function cleanCorruptedCache() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('cache_')) {
      const val = localStorage.getItem(key);
      if (!val || val === '' || val === 'undefined') {
        localStorage.removeItem(key);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', initApp);

// 1. Lectura Meta
async function loadCatalogMeta() {
  try {
    const metaDoc = await getDoc(doc(db, 'meta', 'catalog'));
    if (metaDoc.exists()) {
      serverVersions = metaDoc.data().versions || {};
    }
  } catch (e) {
    console.warn('Usando caché local por falla en meta doc');
  }
}

// 2. Carga de Categorías (Orden local, sin orderBy en Firestore)
async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    allCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allCategories.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderCategories();
  } catch(e) {
    console.error('Error loadCategories:', e);
  }
}

function renderCategories() {
  categoryContainer.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = `category-pill ${currentCategory === 'all' ? 'active' : ''}`;
  allBtn.innerHTML = '🛒 Todas';
  allBtn.onclick = () => selectCategory('all');
  categoryContainer.appendChild(allBtn);

  allCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `category-pill ${currentCategory === cat.name ? 'active' : ''}`;
    btn.innerHTML = `${cat.icon || ''} ${cat.name}`;
    btn.onclick = () => selectCategory(cat.name);
    categoryContainer.appendChild(btn);
  });
}

function selectCategory(name) {
  currentCategory = name;
  renderCategories();
  loadCategoryProducts(name);
}

// 3. Carga desde Storage
async function loadCategoryProducts(categoryName) {
  productContainer.innerHTML = '<div class="loading-spinner" style="padding: 2rem; text-align: center; width: 100%; grid-column: 1/-1;">Cargando catálogo...</div>';

  if (categoryName === 'all') {
    // 4. Carga Paralela
    const results = await Promise.all(allCategories.map(cat => getProductsForCategory(cat.name)));
    products = results.flat();
  } else {
    products = await getProductsForCategory(categoryName);
  }
  
  renderProducts();
  loadFeatured();
}

async function getProductsForCategory(categoryName) {
  const cacheKey = `cache_${categoryName}`;
  const versionKey = `v_${categoryName}`;
  const localVersion = parseInt(localStorage.getItem(versionKey) || '0');
  const serverVersion = parseInt(serverVersions[categoryName] || '0');
  
  // 1. Check Cache
  if (localVersion > 0 && localVersion >= serverVersion) {
    try {
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) return JSON.parse(cachedData);
    } catch(e) {
      console.warn(`Caché corrupto para ${categoryName}, forzando redescarga.`);
      localStorage.removeItem(cacheKey); 
    }
  }
  
  // 2. Safe Fetch from Storage
  try {
    const url = `${STORAGE_BASE_URL}${encodeURIComponent(categoryName)}.json?alt=media`;
    console.warn(`[DEBUG-FETCH] 1. Intentando descargar URL:`, url);
    
    const response = await fetch(url);
    console.warn(`[DEBUG-FETCH] 2. Respuesta HTTP Status:`, response.status, response.ok);
    
    if (!response.ok) {
      if (response.status === 404) {
          console.error(`[DEBUG-FETCH] 3. Error 404: El archivo de ${categoryName} no existe en Storage.`);
          return [];
      }
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const textData = await response.text(); 
    console.warn(`[DEBUG-FETCH] 4. Longitud del texto recibido:`, textData ? textData.length : 0);
    console.warn(`[DEBUG-FETCH] 5. Primeros 50 caracteres:`, textData ? textData.substring(0, 50) : "VACÍO");

    if (!textData || textData.trim() === '') {
       console.error(`[DEBUG-FETCH] 6. Storage devolvió un archivo vacío para ${categoryName}`);
       return [];
    }
    
    const parsedData = JSON.parse(textData);
    console.warn(`[DEBUG-FETCH] 7. JSON parseado con éxito. Productos encontrados:`, parsedData.products ? parsedData.products.length : 0);
    
    const productsList = parsedData.products || [];
    
    // 4. Update Cache
    localStorage.setItem(cacheKey, JSON.stringify(productsList));
    localStorage.setItem(versionKey, String(serverVersion || 1));
    
    return productsList;
    
  } catch(e) {
    console.error(`Fallo crítico cargando ${categoryName}:`, e);
    return []; // Devolver array vacío para no romper la UI
  }
}

// 5. Renderizado Combinado
function renderProducts() {
  productContainer.innerHTML = '';
  let filtered = [...products];
  
  if (currentCategory !== 'all') {
    filtered = filtered.filter(p => p.category === currentCategory);
  }
  
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }
  
  filtered = filtered.filter(p => p.stock === undefined || p.stock > 0);
  
  if (filtered.length === 0) {
    productContainer.innerHTML = '<p class="empty-msg" style="padding: 2rem; grid-column: 1/-1; text-align: center;">No se encontraron productos.</p>';
    return;
  }
  
  filtered.forEach(product => {
    productContainer.appendChild(createProductCard(product));
  });
}

function loadFeatured() {
  const featured = products.filter(p => p.featured);
  if (featured.length === 0) {
    featuredSection.style.display = 'none';
    return;
  }
  featuredSection.style.display = 'block';
  featuredContainer.innerHTML = '';
  featured.forEach(product => {
    featuredContainer.appendChild(createProductCard(product));
  });
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  
  let currentPrice = Number(product.price);
  let isOffer = false;
  if (product.offerPrice && product.offerExpires && new Date(product.offerExpires + 'T23:59:59') >= new Date()) {
    currentPrice = Number(product.offerPrice);
    isOffer = true;
  }

  card.innerHTML = `
    <div class="product-img-wrapper" style="cursor:pointer;" onclick="openProductModal('${product.id}')">
      ${product.featured ? '<span class="badge-featured">Destacado</span>' : ''}
      ${isOffer ? '<span class="badge-featured badge-offer">OFERTA</span>' : ''}
      <img src="${product.imageURL || 'logo.png'}" alt="${product.name}" class="product-img" onerror="this.src='logo.png'">
    </div>
    <div class="product-info">
      <span class="product-category">${product.category}</span>
      <h3 class="product-name" style="cursor:pointer;" onclick="openProductModal('${product.id}')">${product.name}</h3>
      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:auto;">
        <div style="display:flex; flex-direction:column;">
          ${isOffer ? `<span style="text-decoration: line-through; color: var(--text-secondary); font-size: 0.9rem; line-height:1;">$${Number(product.price).toFixed(2)}</span>` : '<span style="height: 0.9rem; display:block;"></span>'}
          <span class="product-price">$${currentPrice.toFixed(2)}</span>
        </div>
        <button class="btn-add" onclick="addToCart('${product.id}')" ${product.stock <= 0 ? 'disabled' : ''}>
          ${product.stock === undefined || product.stock > 0 ? '+ AGREGAR 🛒' : 'Agotado'}
        </button>
      </div>
    </div>
  `;
  return card;
}

// Modales, Carrito y Tracking
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      renderProducts();
    });
  }

  document.getElementById('cartToggleBtn')?.addEventListener('click', () => {
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
  });

  document.getElementById('closeCartBtn')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  
  document.getElementById('checkoutBtn')?.addEventListener('click', openCheckout);
  document.getElementById('checkoutModalCloseBtn')?.addEventListener('click', closeCheckout);
  document.getElementById('checkoutModalOverlay')?.addEventListener('click', closeCheckout);
  
  document.getElementById('checkoutForm')?.addEventListener('submit', submitCheckout);
  
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeProductModal);
  document.getElementById('productModalOverlay')?.addEventListener('click', closeProductModal);

  document.getElementById('btnTrackOrder')?.addEventListener('click', openTrackingModal);
  document.getElementById('trackingModalCloseBtn')?.addEventListener('click', closeTrackingModal);
  document.getElementById('trackingModalOverlay')?.addEventListener('click', closeTrackingModal);
  document.getElementById('btnSearchTracking')?.addEventListener('click', searchTracking);

  document.getElementById('ticketModalCloseBtn')?.addEventListener('click', closeTicketModal);
  document.getElementById('ticketModalOverlay')?.addEventListener('click', closeTicketModal);
}

function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

window.openProductModal = function(id) {
  const product = products.find(p => p.id === id);
  if(!product) return;
  document.getElementById('modalImg').src = product.imageURL || 'https://via.placeholder.com/800x600';
  document.getElementById('modalCategory').textContent = product.category;
  document.getElementById('modalTitle').textContent = product.name;
  document.getElementById('modalDesc').textContent = product.description || '';
  
  let currentPrice = Number(product.price);
  if (product.offerPrice && product.offerExpires && new Date(product.offerExpires + 'T23:59:59') >= new Date()) {
    currentPrice = Number(product.offerPrice);
    document.getElementById('modalPrice').innerHTML = `<span style="text-decoration:line-through; font-size:1.2rem; color:var(--text-secondary); margin-right: 0.5rem;">$${Number(product.price).toFixed(2)}</span>$${currentPrice.toFixed(2)}`;
  } else {
    document.getElementById('modalPrice').textContent = `$${currentPrice.toFixed(2)}`;
  }
  
  document.getElementById('modalAddToCartBtn').onclick = () => {
    addToCart(product.id, 1);
    closeProductModal();
  };
  productModal.classList.add('open');
  document.getElementById('productModalOverlay').classList.add('open');
}

function closeProductModal() {
  productModal.classList.remove('open');
  document.getElementById('productModalOverlay').classList.remove('open');
}

window.addToCart = function(productId, quantity = 1) {
  const product = products.find(p => p.id === productId);
  if(!product) return;
  const existingItem = cart.find(item => item.id === productId);
  let currentPrice = Number(product.price);
  if (product.offerPrice && product.offerExpires && new Date(product.offerExpires + 'T23:59:59') >= new Date()) {
    currentPrice = Number(product.offerPrice);
  }
  if(existingItem) {
    existingItem.qty += quantity;
    existingItem.price = currentPrice;
  } else {
    cart.push({ id: product.id, name: product.name, price: currentPrice, imageURL: product.imageURL, qty: quantity });
  }
  saveCart(); renderCart(); showToast(`${product.name} agregado!`);
}

window.updateQuantity = function(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) cart = cart.filter(i => i.id !== productId);
  saveCart(); renderCart();
}

window.removeFromCart = function(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart(); renderCart();
}

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

function renderCart() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  cartBadge.textContent = totalItems;
  if(cart.length === 0) {
    cartItemsContainer.innerHTML = '<div style="text-align:center;color:var(--text-secondary);margin-top:2rem;">El carrito está vacío</div>';
    cartTotalText.textContent = '$0.00'; checkoutBtn.disabled = true; return;
  }
  checkoutBtn.disabled = false;
  cartItemsContainer.innerHTML = '';
  let total = 0;
  cart.forEach(item => {
    total += item.price * item.qty;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <img src="${item.imageURL || 'logo.png'}" class="cart-item-img" onerror="this.src='logo.png'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$${Number(item.price).toFixed(2)}</div>
        <div class="cart-controls">
          <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
          <span class="cart-item-qty">${item.qty}</span>
          <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
          <button class="remove-item" onclick="removeFromCart('${item.id}')">🗑️</button>
        </div>
      </div>
    `;
    cartItemsContainer.appendChild(div);
  });
  cartTotalText.textContent = `$${total.toLocaleString('es-AR')}`;
}

// 6. Checkout con DNI/Phone Seguro
function openCheckout() {
  if (cart.length === 0) return;
  closeCart();
  const zoneSelect = document.getElementById('checkoutZone');
  if (zoneSelect.options.length <= 1) {
    ZONAS.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z.zona; opt.textContent = z.zona;
      zoneSelect.appendChild(opt);
    });
  }
  const saved = JSON.parse(localStorage.getItem('customer_data') || '{}');
  if (saved.name) document.getElementById('checkoutName').value = saved.name;
  if (saved.dni) document.getElementById('checkoutDNI').value = saved.dni;
  if (saved.phone) document.getElementById('checkoutPhone').value = saved.phone;
  if (saved.address) document.getElementById('checkoutAddress').value = saved.address;
  if (saved.cp) document.getElementById('checkoutCP').value = saved.cp;
  if (saved.zone) {
    document.getElementById('checkoutZone').value = saved.zone;
  }
  checkoutModal.classList.add('open');
  document.getElementById('checkoutModalOverlay').classList.add('open');
}

function closeCheckout() {
  checkoutModal.classList.remove('open');
  document.getElementById('checkoutModalOverlay').classList.remove('open');
}

function updateNeighborhoodOptions(zoneName) {
  // Función eliminada según requerimiento
}

async function submitCheckout(e) {
  e.preventDefault();
  const zone = document.getElementById('checkoutZone').value;
  const zonaData = ZONAS.find(z => z.zona === zone);
  const branchAsignada = zonaData ? zonaData.sucursal : 'Sin sucursal';
  
  const customerData = {
    name: document.getElementById('checkoutName').value,
    dni: document.getElementById('checkoutDNI').value.replace(/\D/g, ''),
    phone: document.getElementById('checkoutPhone').value,
    address: document.getElementById('checkoutAddress').value,
    cp: document.getElementById('checkoutCP').value,
    zone
  };
  localStorage.setItem('customer_data', JSON.stringify(customerData));
  
  try {
    const phoneClean = customerData.phone.replace(/\D/g, '');
    const customerId = customerData.dni || phoneClean || Date.now().toString();
    
    await setDoc(doc(db, 'customers', customerId), { ...customerData, lastOrder: serverTimestamp() }, { merge: true });
    
    const order = {
      customer: customerData, items: cart,
      total: cart.reduce((sum, item) => sum + item.price * item.qty, 0),
      status: 'pending', isPaid: false, paymentMethod: document.getElementById('checkoutPayment').value,
      branch: branchAsignada, createdAt: serverTimestamp()
    };
    const orderRef = await addDoc(collection(db, 'orders'), order);
    
    const WA_NUMBER = '5493874XXXXXX'; // TODO: Cambiar por el real
    let msg = `🛒 *Nuevo pedido El Milagro*\nID: ${orderRef.id.slice(0,8)}\n👤 ${customerData.name}\n📍 ${customerData.address}, ${zone}\n🏪 Sucursal: ${branchAsignada}\n💰 *Total: $${order.total.toLocaleString('es-AR')}*`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    
    cart = []; saveCart(); renderCart(); closeCheckout();
    showToast('¡Pedido enviado! Revisá tu WhatsApp.');
  } catch(e) {
    showToast('Error al procesar el pedido.', 'error');
  }
}

// Tracking y Temas
function initTheme() {
  let savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.setAttribute('data-theme', savedTheme);
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    if(btn.dataset.themeBtn === savedTheme) btn.classList.add('active');
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
      const t = btn.dataset.themeBtn; document.body.setAttribute('data-theme', t); localStorage.setItem('theme', t);
    });
  });
}

function openTrackingModal() {
  document.getElementById('trackingModalOverlay').classList.add('open');
  document.getElementById('trackingModal').classList.add('open');
  const saved = JSON.parse(localStorage.getItem('customer_data') || '{}');
  if (saved.dni) document.getElementById('trackingDNI').value = saved.dni;
}

function closeTrackingModal() {
  document.getElementById('trackingModalOverlay').classList.remove('open');
  document.getElementById('trackingModal').classList.remove('open');
}

async function searchTracking() {
  const dni = document.getElementById('trackingDNI').value.replace(/\D/g, '');
  if (!dni) return;
  const btn = document.getElementById('btnSearchTracking'); btn.disabled = true;
  try {
    const q = query(collection(db, 'orders'), where('customer.dni', '==', dni));
    const snap = await getDocs(q);
    if (snap.empty) {
      document.getElementById('trackingError').style.display = 'block';
      document.getElementById('trackingResult').style.display = 'none';
    } else {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderTrackingResults(orders.slice(0, 3));
    }
  } catch(e) {}
  btn.disabled = false;
}

function renderTrackingResults(orders) {
  const container = document.getElementById('trackingResult');
  container.style.display = 'block'; document.getElementById('trackingError').style.display = 'none';
  
  const ORDER_STATUSES = [
    { key: 'no_autorizado', label: '❌ No Autorizado', emoji: '🚫' },
    { key: 'pagado', label: '💰 Pagado', emoji: '💰' },
    { key: 'pending', label: '⏳ Pendiente', emoji: '⏳' },
    { key: 'preparando', label: '👨🍳 Preparando', emoji: '👨🍳' },
    { key: 'en_camino', label: '🛵 En camino', emoji: '🛵' },
    { key: 'entregado', label: '✅ Entregado', emoji: '✅' },
  ];

  container.innerHTML = orders.map(order => {
    if (order.status === 'retirar_en_sucursal') {
      return `
        <div class="tracking-container">
          <h4>Pedido #${order.id.slice(-5).toUpperCase()}</h4>
          <div class="branch-withdrawal-alert">
              <h5>⚠️ Retirar por la sucursal</h5>
              <p>El transportista no te encontró. Tu pedido te espera en caja.</p>
          </div>
          <button class="btn-track-premium" onclick="window.openTicketModal('${order.id}', '${order.customer?.dni}')">MI TICKET</button>
        </div>
      `;
    }

    const currentIndex = ORDER_STATUSES.findIndex(s => s.key === order.status);
    const progressPct = currentIndex < 0 ? 0 : Math.round((currentIndex / (ORDER_STATUSES.length - 1)) * 100);
    
    return `
      <div class="tracking-container">
        <h4>Pedido #${order.id.slice(-5).toUpperCase()}</h4>
        <div class="tracking-bar">
          <div class="tracking-progress-fill" style="width: ${progressPct}%;">
            <div class="tracking-icon-carrier">🛵</div>
          </div>
          ${ORDER_STATUSES.map((s, i) => `
            <div class="tracking-step ${i < currentIndex ? 'done' : i === currentIndex ? 'active' : ''}">
              <div class="step-dot"></div>
              <span class="step-label">${s.emoji} ${s.label.split(' ').slice(1).join(' ')}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn-track-premium" onclick="window.openTicketModal('${order.id}', '${order.customer?.dni}')">MI TICKET</button>
      </div>
    `;
  }).join('');
}

window.openTicketModal = function(id, dni) {
  document.getElementById('ticketCode').textContent = '#' + id.slice(-5).toUpperCase();
  document.getElementById('ticketDNI').textContent = dni || 'N/A';
  
  // Limpiar y generar QR
  const qrContainer = document.getElementById('ticketQR');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: id, width: 150, height: 150 });
  }

  document.getElementById('ticketModal').classList.add('open');
  document.getElementById('ticketModalOverlay').classList.add('open');
}

function closeTicketModal() {
  document.getElementById('ticketModal').classList.remove('open');
  document.getElementById('ticketModalOverlay').classList.remove('open');
}

function showToast(message, type = 'success') {
  toastMessage.textContent = message; toastMessage.className = `toast show ${type}`;
  setTimeout(() => toastMessage.classList.remove('show'), 3000);
}
