import styles from "./Login.module.css";

export default function Login() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>CC Statement Tracker</h1>
      <p className={styles.subtitle}>Sign in to manage your credit card statements</p>
      <a href="http://localhost:8000/auth/login" className={styles.button}>
        Sign in with Google
      </a>
    </div>
  );
}
