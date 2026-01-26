import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDNkjLashsuvkA90kMeflQdzdb4bZWmIag",
  authDomain: "studio-4343626376-fea63.firebaseapp.com",
  projectId: "studio-4343626376-fea63",
  storageBucket: "studio-4343626376-fea63.firebasestorage.app",
  messagingSenderId: "182684151300",
  appId: "1:182684151300:web:39794fb110b14ccc170f51"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
