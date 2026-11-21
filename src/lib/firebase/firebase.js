import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCcTyJ86hcWXkkYLfDckERA0cZ0scBTgMFo",
  authDomain: "yb-tech-16079.firebaseapp.com",
  projectId: "yb-tech-16079",
  storageBucket: "yb-tech-16079.firebasestorage.app",
  messagingSenderId: "1057581916971",
  appId: "1:1057581916971:web:9ca1a23318954d16bbdb6e",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
