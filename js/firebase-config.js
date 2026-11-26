/*
 * Firebase settings for online saving (Google sign-in + Firestore).
 *
 * These values identify the Firebase project; they are not secret and are safe in a public repo.
 * What protects each player's castle are the Firestore security rules (see docs/FIREBASE_SETUP.md).
 * To run the game without online saving, delete this file or empty the object.
 */
window.STACK_A_CASTLE_FIREBASE = {
  apiKey: 'AIzaSyC5GFOSHI2QOhsDTFfuxDb0vyDy9PnWnoI',
  authDomain: 'stack-a-castle.firebaseapp.com',
  projectId: 'stack-a-castle',
  storageBucket: 'stack-a-castle.firebasestorage.app',
  messagingSenderId: '197263867066',
  appId: '1:197263867066:web:bf6a71ac9f4faf59d99683'
};
