import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDNkjLashsuvkA9OkMeflQdzdb4bZWmIag",
  authDomain: "studio-4343626376-fea63.firebaseapp.com",
  projectId: "studio-4343626376-fea63",
  storageBucket: "studio-4343626376-fea63.firebasestorage.app",
  messagingSenderId: "182684151300",
  appId: "1:182684151300:web:39794fb110b14ccc170f51"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
