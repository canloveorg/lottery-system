import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCg0NXOZvHPXYodltR2fjZNXE29quibg58",
  authDomain: "lottery-system-534ed.firebaseapp.com",
  databaseURL: "https://lottery-system-534ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lottery-system-534ed",
  storageBucket: "lottery-system-534ed.firebasestorage.app",
  messagingSenderId: "154076219882",
  appId: "1:154076219882:web:007fa4485355b005f98a93",
  measurementId: "G-D8BMY19YHV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics removed to ensure stability
// Explicitly pass the URL for regional databases (asia-southeast1)
export const db = getDatabase(app, firebaseConfig.databaseURL);

console.log("Firebase Database Initialized");