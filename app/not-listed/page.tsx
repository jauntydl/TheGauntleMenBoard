import { getUnresolved } from '@/lib/data';
import { NotListed } from '@/components/NotListed';

export const revalidate = 3600;

export default function Page() {
  return <NotListed entries={getUnresolved()} />;
}
