import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSjlHVAIWy8LiPaoD31biyTQ3W_UdL5us",
  authDomain: "lacteos-elmilagro.firebaseapp.com",
  projectId: "lacteos-elmilagro",
  storageBucket: "lacteos-elmilagro.firebasestorage.app",
  messagingSenderId: "1048870846106",
  appId: "1:1048870846106:web:4b0071677f22f80b12a923"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
