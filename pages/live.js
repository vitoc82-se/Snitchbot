import { useRouter } from 'next/router';
import LiveView from '../components/LiveView';

export default function LivePage() {
  const router = useRouter();
  // Wait for the query to hydrate so ?code= prefills the input on first mount.
  if (!router.isReady) return null;
  return <LiveView initialCode={router.query.code || ''} />;
}
