import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDNkjLashsuvkA90kMeflQdzdb4bZWmIag",
  authDomain: "studio-4343626376-fea63.firebaseapp.com",
  projectId: "studio-4343626376-fea63",
  storageBucket: "studio-4343626376-fea63.firebasestorage.app",
  messagingSenderId: "182684151300",
  appId: "1:182684151300:web:39794fb110b14ccc170f51"
};

// Initialize Firebase only if it hasn't been initialized yet
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");

export { app, db, auth, functions };
