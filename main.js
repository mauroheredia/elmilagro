import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp, setDoc, doc, query, where, Timestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Estado de la app
let products = [];
let categories = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentCategory = 'all';
let searchQuery = '';

const ZONAS = [
  { zona: 'Zona Norte', sucursal: 'Sucursal Bolivia' },
  { zona: 'Zona Sur', sucursal: 'Sucursal Chile' },
  { zona: 'Zona Este', sucursal: 'Sucursal Artigas' },
  { zona: 'Zona Centro', sucursal: 'Sucursal Arenales' },
  { zona: 'Zona Oeste', sucursal: 'Sucursal Arenales' },
  { zona: 'Orán', sucursal: 'Sucursal Orán' },
];

// Elementos DOM
const productContainer = document.getElementById('productContainer');
const featuredContainer = document.getElementById('featuredContainer');
const featuredSection = document.getElementById('featuredSection');
const categoryContainer = document.getElementById('categoryContainer');
const productsTitle = document.getElementById('productsTitle');

const cartBadge = document.getElementById('cartBadge');
const cartSidebar = document.getElementById('cartSidebar');
const cartToggleBtn = document.getElementById('cartToggleBtn');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartItemsContainer = document.getElementById('cartItemsContainer');
const cartTotalText = document.getElementById('cartTotalText');
const checkoutBtn = document.getElementById('checkoutBtn');

const productModal = document.getElementById('productModal');
const productModalOverlay = document.getElementById('productModalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalImg = document.getElementById('modalImg');
const modalCategory = document.getElementById('modalCategory');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalPrice = document.getElementById('modalPrice');
const modalAddToCartBtn = document.getElementById('modalAddToCartBtn');

const cartOverlay = document.getElementById('cartOverlay');

// DOM Elements: Checkout
const checkoutModal = document.getElementById('checkoutModal');
const checkoutModalOverlay = document.getElementById('checkoutModalOverlay');
const checkoutModalCloseBtn = document.getElementById('checkoutModalCloseBtn');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutPhone = document.getElementById('checkoutPhone');
const checkoutZone = document.getElementById('checkoutZone');
const checkoutCP = document.getElementById('checkoutCP');
const checkoutAddress = document.getElementById('checkoutAddress');

const toastMessage = document.getElementById('toastMessage');

// Inicializacion
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initCartListeners();
  updateCartUI();
  const searchInput = document.getElementById('searchInput');
  if(searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      renderProducts();
    });
  }

  try {
    await fetchCategories();
    await fetchProducts();
    renderCategories();
    renderProducts();
    renderFeaturedProducts();
  } catch (error) {
    console.error("Error cargando datos:", error);
    productContainer.innerHTML = '<p style="padding: 2rem; color: var(--danger-color);">Error conectando con la base de datos. Verifica la configuración de Firebase.</p>';
  }
});

// Temas
function initTheme() {
  let savedTheme = localStorage.getItem('theme');
  if(!savedTheme) {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      savedTheme = 'dark';
    } else {
      savedTheme = 'light';
    }
  }
  
  document.body.setAttribute('data-theme', savedTheme);
  
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    if(btn.dataset.themeBtn === savedTheme) {
      btn.classList.add('active');
    }
    
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.dataset.themeBtn;
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    });
  });
}

// Data fetching
async function fetchCategories() {
  const querySnapshot = await getDocs(collection(db, "categories"));
  categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  categories.sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function fetchProducts() {
  const querySnapshot = await getDocs(collection(db, "products"));
  products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Render UI
function renderCategories() {
  categoryContainer.innerHTML = '';
  
  const allBtn = document.createElement('button');
  allBtn.className = `category-pill ${currentCategory === 'all' ? 'active' : ''}`;
  allBtn.innerHTML = '🛒 Todas';
  allBtn.addEventListener('click', () => filterByCategory('all'));
  categoryContainer.appendChild(allBtn);

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `category-pill ${currentCategory === cat.name ? 'active' : ''}`;
    btn.innerHTML = `${cat.icon || ''} ${cat.name}`;
    btn.addEventListener('click', () => filterByCategory(cat.name));
    categoryContainer.appendChild(btn);
  });
}

function filterByCategory(categoryName) {
  currentCategory = categoryName;
  renderCategories();
  renderProducts();
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  
  // Lógica de Ofertas
  let isOfferActive = false;
  let currentPrice = Number(product.price);
  if (product.offerPrice && product.offerExpires) {
    // El expire llega de "YYYY-MM-DD", pero hay que crear Date local.
    // Para simplificar:
    if (new Date(product.offerExpires + 'T23:59:59') >= new Date()) {
      currentPrice = Number(product.offerPrice);
      isOfferActive = true;
    }
  }

  card.innerHTML = `
    <div class="product-img-wrapper" style="cursor:pointer;" onclick="openProductModal('${product.id}')">
      ${product.featured ? '<span class="badge-featured">Destacado</span>' : ''}
      ${isOfferActive ? '<span class="badge-featured badge-offer">OFERTA</span>' : ''}
      <img src="${product.imageURL || 'https://via.placeholder.com/400x300'}" alt="${product.name}" class="product-img" onerror="this.src='https://via.placeholder.com/400x300'">
    </div>
    <div class="product-info">
      <span class="product-category">${product.category}</span>
      <h3 class="product-name" style="cursor:pointer;" onclick="openProductModal('${product.id}')">${product.name}</h3>
      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:auto;">
        <div style="display:flex; flex-direction:column;">
          ${isOfferActive ? `<span style="text-decoration: line-through; color: var(--text-secondary); font-size: 0.9rem; line-height:1;">$${Number(product.price).toFixed(2)}</span>` : '<span style="height: 0.9rem; display:block;"></span>'}
          <span class="product-price">$${currentPrice.toFixed(2)}</span>
        </div>
        <button class="btn-add" onclick="addToCart('${product.id}')" ${product.stock <= 0 ? 'disabled' : ''}>
          ${product.stock > 0 ? '+ AGREGAR 🛒' : 'Agotado'}
        </button>
      </div>
    </div>
  `;
  return card;
}

function renderProducts() {
  productContainer.innerHTML = '';
  
  let filtered = products;
  if(currentCategory !== 'all') {
    filtered = products.filter(p => p.category === currentCategory);
  }

  if(searchQuery) {
    filtered = filtered.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchQuery)) || 
      (p.description && p.description.toLowerCase().includes(searchQuery))
    );
  }

  if(filtered.length === 0) {
    productContainer.innerHTML = '<p style="padding: 2rem;">No se encontraron productos.</p>';
    return;
  }

  filtered.forEach(product => {
    productContainer.appendChild(createProductCard(product));
  });
}

function renderFeaturedProducts() {
  const featured = products.filter(p => p.featured);
  
  if(featured.length === 0) {
    featuredSection.style.display = 'none';
    return;
  }

  featuredSection.style.display = 'block';
  featuredContainer.innerHTML = '';
  
  featured.forEach(product => {
    featuredContainer.appendChild(createProductCard(product));
  });
}

// Modal Logic
window.openProductModal = function(id) {
  const product = products.find(p => p.id === id);
  if(!product) return;

  modalImg.src = product.imageURL || 'https://via.placeholder.com/800x600';
  modalCategory.textContent = product.category;
  modalTitle.textContent = product.name;
  modalDesc.textContent = product.description || '';
  
  let currentPrice = Number(product.price);
  if (product.offerPrice && product.offerExpires && new Date(product.offerExpires + 'T23:59:59') >= new Date()) {
    currentPrice = Number(product.offerPrice);
    modalPrice.innerHTML = `<span style="text-decoration:line-through; font-size:1.2rem; color:var(--text-secondary); margin-right: 0.5rem;">$${Number(product.price).toFixed(2)}</span>$${currentPrice.toFixed(2)}`;
  } else {
    modalPrice.textContent = `$${currentPrice.toFixed(2)}`;
  }
  
  modalAddToCartBtn.onclick = () => {
    addToCart(product.id, 1);
    closeProductModal();
  };

  if(product.stock <= 0) {
    modalAddToCartBtn.disabled = true;
    modalAddToCartBtn.textContent = 'Agotado';
  } else {
    modalAddToCartBtn.disabled = false;
    modalAddToCartBtn.textContent = '+ AGREGAR 🛒';
  }

  productModal.classList.add('open');
  productModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  productModal.classList.remove('open');
  productModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalCloseBtn.addEventListener('click', closeProductModal);
productModalOverlay.addEventListener('click', closeProductModal);

// Cart Logic
function initCartListeners() {
  cartToggleBtn.addEventListener('click', () => {
    cartSidebar.classList.add('open');
    cartOverlay.classList.add('open');
  });

  if(cartOverlay) {
    cartOverlay.addEventListener('click', closeCart);
  }

  closeCartBtn.addEventListener('click', closeCart);
  
  // En lugar de enviar directo a WA, abrimos el checkout
  checkoutBtn.addEventListener('click', () => {
    if(cart.length === 0) return;
    closeCart(); // Cerramos carrito
    
    const checkoutZone = document.getElementById('checkoutZone');
    if(checkoutZone.options.length <= 1) {
      ZONAS.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z.zona; opt.textContent = z.zona;
        checkoutZone.appendChild(opt);
      });
    }

    const savedCustomer = JSON.parse(localStorage.getItem('customer_data'));
    if (savedCustomer) {
      document.getElementById('checkoutName').value = savedCustomer.name || '';
      document.getElementById('checkoutDNI').value = savedCustomer.dni || '';
      document.getElementById('checkoutPhone').value = savedCustomer.phone || '';
      document.getElementById('checkoutZone').value = savedCustomer.zone || '';
      document.getElementById('checkoutAddress').value = savedCustomer.address || '';
      document.getElementById('checkoutCP').value = savedCustomer.cp || '';
    }

    checkoutModal.classList.add('open');
    checkoutModalOverlay.classList.add('open');
  });

  checkoutModalCloseBtn.addEventListener('click', closeCheckout);
  checkoutModalOverlay.addEventListener('click', closeCheckout);

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Obtener datos del form
    const customerName = document.getElementById('checkoutName').value.trim();
    const dniRaw = document.getElementById('checkoutDNI').value.trim();
    const dni = dniRaw.replace(/\D/g, ''); // Normalizar DNI: solo números
    const phone = checkoutPhone.value.trim();
    const zone = checkoutZone.value;
    const cp = checkoutCP.value.trim();
    const address = checkoutAddress.value.trim();
    const paymentMethod = document.getElementById('checkoutPayment').value;
    
    const zonaSeleccionada = ZONAS.find(z => z.zona === zone);
    const branchAsignada = zonaSeleccionada ? zonaSeleccionada.sucursal : 'Genérica';

    // Preparar el mensaje para WhatsApp
    let msj = "¡Hola! Quiero hacer un pedido.\\n\\n";
    msj += "*Mis Datos de Envío:*\\n";
    msj += `- Nombre: ${customerName}\\n`;
    msj += `- DNI: ${dni}\\n`;
    msj += `- Teléfono: ${phone}\\n`;
    msj += `- Zona: ${zone}\\n`;
    msj += `- Dirección: ${address}\\n`;
    msj += `- C.P.: ${cp}\\n`;
    msj += `- Método de pago: ${paymentMethod}\\n\\n`;

    msj += "*Mi Pedido:*\\n";
    let total = 0;
    cart.forEach(item => {
      msj += `${item.quantity}x ${item.name} - $${(item.price * item.quantity).toFixed(2)}\\n`;
      total += item.price * item.quantity;
    });
    msj += `\\n*Total: $${total.toFixed(2)}*`;

    // 1. Guardar en Firestore y Local Storage
    try {
      checkoutForm.querySelector('button[type="submit"]').textContent = "Procesando...";
      checkoutForm.querySelector('button[type="submit"]').disabled = true;
      
      localStorage.setItem('customer_data', JSON.stringify({
        name: customerName, dni, phone, zone, address, cp
      }));
      
      const dniId = dni.replace(/\D/g,'');
      if (dniId) {
        await setDoc(doc(db, "customers", dniId), {
          name: customerName, dni, phone, zone, address, cp,
          lastOrder: serverTimestamp()
        }, { merge: true });
      }

      const orderData = {
        customer: { name: customerName, dni, phone, zone, cp, address },
        items: cart,
        total: total,
        status: "pending",
        isPaid: false,
        paymentMethod: paymentMethod,
        branch: branchAsignada,
        createdAt: serverTimestamp()
      };
      
      // Guardar en coleccion orders
      await addDoc(collection(db, "orders"), orderData);
      
    } catch(err) {
      console.error("Error guardando orden:", err);
      // Opcional: Podrías detener el envío a WA, pero si Firebase falla, capaz a WA llega igual y no pierden la venta
    }

    // 2. Abre WhatsApp con el mensaje
    // TODO: reemplazar con número de WhatsApp real de El Milagro
    const WA_NUMBER = '549XXXXXXXXXX';
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msj)}`, '_blank');
    
    showToast("Redirigiendo a WhatsApp...");
    closeCheckout();
    
    // Limpiar el estado visual
    checkoutForm.querySelector('button[type="submit"]').textContent = "Confirmar y Pedir por WhatsApp";
    checkoutForm.querySelector('button[type="submit"]').disabled = false;
    
    // Vaciar carrito
    cart = [];
    saveCart();
    updateCartUI();
  });

  document.getElementById('btnTrackOrder').addEventListener('click', () => {
    document.getElementById('trackingModalOverlay').classList.add('open');
    document.getElementById('trackingModal').classList.add('open');
    
    const savedCustomer = JSON.parse(localStorage.getItem('customer_data'));
    if(savedCustomer && savedCustomer.dni) {
      document.getElementById('trackingDNI').value = savedCustomer.dni;
    }
  });

  document.getElementById('trackingModalCloseBtn').addEventListener('click', () => {
    document.getElementById('trackingModalOverlay').classList.remove('open');
    document.getElementById('trackingModal').classList.remove('open');
  });

  document.getElementById('btnSearchTracking').addEventListener('click', async () => {
    const dniIngresado = document.getElementById('trackingDNI').value.trim().replace(/\D/g, '');
    if(!dniIngresado) return;
    
    const btn = document.getElementById('btnSearchTracking');
    btn.textContent = 'Buscando...';
    btn.disabled = true;

    const resDiv = document.getElementById('trackingResult');
    const errDiv = document.getElementById('trackingError');
    resDiv.style.display = 'none';
    errDiv.style.display = 'none';

    try {
      // Búsqueda sin orderBy para evitar requerir índice compuesto en Firestore
      const q = query(
        collection(db, "orders"),
        where("customer.dni", "==", dniIngresado)
      );
      const snap = await getDocs(q);
      
      if(snap.empty) {
        errDiv.style.display = 'block';
      } else {
        // Ordenar localmente por fecha descendente y mostrar los últimos 3
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        orders.sort((a, b) => {
          const ta = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : 0) : 0;
          const tb = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : 0) : 0;
          return tb - ta;
        });
        const toShow = orders.slice(0, 3);

        resDiv.innerHTML = '';
        toShow.forEach(order => {
          const orderId = order.id;
          
          const stepsOrder = ['no_autorizado', 'pagado', 'pending', 'preparando', 'en_camino', 'entregado'];
          let currentIdx = stepsOrder.indexOf(order.status) > -1 ? stepsOrder.indexOf(order.status) : 1;
          
          // Especial: si el estado es 'retirar_en_sucursal', lo tratamos como 'en_camino' a nivel visual de barra,
          // pero mostramos la alerta de retiro.
          const isWithdrawal = order.status === 'retirar_en_sucursal';
          if(isWithdrawal) currentIdx = 4; // Queda en 'en_camino' pero con alerta
          
          const progressPercent = (currentIdx / (stepsOrder.length - 1)) * 100;
          
          let carrierIcon = '📦';
          if(order.status === 'en_camino' || isWithdrawal) carrierIcon = '🛵';
          if(order.status === 'entregado') carrierIcon = '🚚';
          if(order.status === 'preparando') carrierIcon = '👨‍🍳';

          let fechaStr = '';
          if(order.createdAt && order.createdAt.toDate) {
            fechaStr = order.createdAt.toDate().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
          }

          const container = document.createElement('div');
          container.className = 'tracking-container';
          container.innerHTML = `
            ${isWithdrawal ? '<div class="withdrawal-alert">Retirar en la sucursal</div>' : ''}
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
              <h3 style="color: var(--primary-color); margin: 0;">Pedido #${orderId.slice(-5)}</h3>
              <span style="font-size: 0.8rem; background: var(--amarillo); color: var(--verde); padding: 2px 8px; border-radius: 4px; font-weight: bold;">${order.status.toUpperCase()}</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Total: $${Number(order.total).toFixed(2)}</p>
            ${fechaStr ? `<p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 2rem;">📅 ${fechaStr}</p>` : '<div style="margin-bottom:2rem"></div>'}
            
            <div class="tracking-bar">
              <div class="tracking-progress-fill" style="width: ${progressPercent}%">
                <div class="tracking-icon-carrier">${carrierIcon}</div>
              </div>
              
              <div class="tracking-step ${currentIdx >= 0 ? (currentIdx == 0 ? 'active' : 'done') : ''}" data-step="no_autorizado">
                <div class="step-dot"></div>
                <div class="step-label">No Autorizado</div>
              </div>
              <div class="tracking-step ${currentIdx >= 1 ? (currentIdx == 1 ? 'active' : 'done') : ''}" data-step="pagado">
                <div class="step-dot"></div>
                <div class="step-label">Pagado</div>
              </div>
              <div class="tracking-step ${currentIdx >= 2 ? (currentIdx == 2 ? 'active' : 'done') : ''}" data-step="pending">
                <div class="step-dot"></div>
                <div class="step-label">Pendiente</div>
              </div>
              <div class="tracking-step ${currentIdx >= 3 ? (currentIdx == 3 ? 'active' : 'done') : ''}" data-step="preparando">
                <div class="step-dot"></div>
                <div class="step-label">Preparando</div>
              </div>
              <div class="tracking-step ${currentIdx >= 4 ? (currentIdx == 4 ? 'active' : 'done') : ''}" data-step="en_camino">
                <div class="step-dot"></div>
                <div class="step-label">En camino</div>
              </div>
              <div class="tracking-step ${currentIdx >= 5 ? (currentIdx == 5 ? 'active' : 'done') : ''}" data-step="entregado">
                <div class="step-dot"></div>
                <div class="step-label">Entregado</div>
              </div>
            </div>
            ${isWithdrawal ? `<button class="btn-track-premium" onclick="window.openTicketModal('${orderId}', '${order.customer?.dni}')">MÍ TICKET</button>` : ''}
          `;
          resDiv.appendChild(container);
        });
        
        resDiv.style.display = 'block';
      }
    } catch(e) {
      console.error('Error tracking:', e);
      errDiv.textContent = 'Error al buscar pedidos. Intentá de nuevo.';
      errDiv.style.display = 'block';
    }
    btn.textContent = 'Buscar';
    btn.disabled = false;
  });
}


function closeCart() {
  cartSidebar.classList.remove('open');
  if(cartOverlay) cartOverlay.classList.remove('open');
}

function closeCheckout() {
  checkoutModal.classList.remove('open');
  checkoutModalOverlay.classList.remove('open');
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
    existingItem.quantity += quantity;
    existingItem.price = currentPrice; // en caso de q haya cambiado
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: currentPrice,
      imageURL: product.imageURL,
      quantity: quantity
    });
  }

  saveCart();
  updateCartUI();
  showToast(`${product.name} agregado al carrito!`, 'success');
  
  // Animar el icono
  cartToggleBtn.style.transform = 'scale(1.2)';
  setTimeout(() => cartToggleBtn.style.transform = '', 200);
}

window.updateQuantity = function(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if(!item) return;

  item.quantity += delta;
  if(item.quantity <= 0) {
    removeFromCart(productId);
  } else {
    saveCart();
    updateCartUI();
  }
}

window.removeFromCart = function(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartUI() {
  // Update badge
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartBadge.textContent = totalItems;

  if(cart.length === 0) {
    cartItemsContainer.innerHTML = '<div style="text-align:center;color:var(--text-secondary);margin-top:2rem;">El carrito está vacío</div>';
    cartTotalText.textContent = '$0.00';
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;
  cartItemsContainer.innerHTML = '';
  let total = 0;

  cart.forEach(item => {
    total += item.price * item.quantity;
    
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <img src="${item.imageURL || 'https://via.placeholder.com/150'}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/150'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$${Number(item.price).toFixed(2)}</div>
        <div class="cart-controls">
          <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
          <span class="cart-item-qty">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
          <button class="remove-item" onclick="removeFromCart('${item.id}')">🗑️</button>
        </div>
      </div>
    `;
    cartItemsContainer.appendChild(div);
  });

  cartTotalText.textContent = `$${total.toFixed(2)}`;
}

// Utilidad Toast
function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  toastMessage.className = `toast show ${type}`;
  
  setTimeout(() => {
    toastMessage.classList.remove('show');
  }, 3000);
}

// --- Lógica del Ticket de Retiro ---
window.openTicketModal = function(orderId, dni) {
  document.getElementById('ticketCode').textContent = '#' + orderId.slice(-5).toUpperCase();
  document.getElementById('ticketDNI').textContent = dni || 'Sin registrar';
  
  document.getElementById('ticketModal').classList.add('open');
  document.getElementById('ticketModalOverlay').classList.add('open');
};

function closeTicketModal() {
  document.getElementById('ticketModal').classList.remove('open');
  document.getElementById('ticketModalOverlay').classList.remove('open');
}

document.getElementById('ticketModalCloseBtn')?.addEventListener('click', closeTicketModal);
document.getElementById('ticketModalOverlay')?.addEventListener('click', closeTicketModal);
