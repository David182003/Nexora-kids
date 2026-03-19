import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDZIZfWn79gzlznytG34RaSVtVGp57k9jw",
  authDomain: "nexora-kids.firebaseapp.com",
  projectId: "nexora-kids",
  storageBucket: "nexora-kids.firebasestorage.app",
  messagingSenderId: "1024849178642",
  appId: "1:1024849178642:web:9c6bda5a5a193f3189e8cb"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);