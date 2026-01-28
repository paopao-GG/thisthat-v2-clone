/**
 * Custom hook for authentication
 * Re-exported from AuthContext for convenience
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, loading, isAuthenticated, logout } = useAuth();
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (!isAuthenticated) return <div>Please log in</div>;
 * 
 *   return (
 *     <div>
 *       <p>Welcome, {user?.username}!</p>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export { useAuth } from '@shared/contexts/AuthContext';




