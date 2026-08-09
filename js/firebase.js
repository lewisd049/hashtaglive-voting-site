import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_COLLECTION, SHOWS_COLLECTION, QUESTIONS_COLLECTION, VOTES_COLLECTION } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const names = { ADMIN_COLLECTION, SHOWS_COLLECTION, QUESTIONS_COLLECTION, VOTES_COLLECTION };

export { collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch };
export { signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence };
