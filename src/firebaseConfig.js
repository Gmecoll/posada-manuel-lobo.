import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDNkjLashsuvkA9OkMeflQdzdb4bZWmIa",
  authDomain: "studio-4343626376-fea63.firebaseapp.com",
  projectId: "studio-4343626376-fea63",
  storageBucket: "studio-4343626376-fea63.appspot.com",
  messagingSenderId: "797368553258",
  appId: "1:797368553258:web:78564b78426f4f22c6014d"
};

// Inicialización segura para Next.js
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");

export { app, db, auth, functions };
