import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions"; // <-- 1. Agregamos esto

const firebaseConfig = {
  apiKey: "AIzaSyDNkjLashsuvkA90kMeflQdzdb4bZWmIag",
  authDomain: "studio-4343626376-fea63.firebaseapp.com",
  projectId: "studio-4343626376-fea63",
  storageBucket: "studio-4343626376-fea63.firebasestorage.app",
  messagingSenderId: "182684151300",
  appId: "1:182684151300:web:39794fb110b14ccc170f51"
};

// 2. Exportamos 'app' para que el AdminLockPanel pueda usarla
export const app = initializeApp(firebaseConfig); 
export const db = getFirestore(app);
// 3. Opcional: También puedes exportar functions directamente
export const functions = getFunctions(app, "us-central1");