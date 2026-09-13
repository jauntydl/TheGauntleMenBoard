import { getBoard } from '@/lib/data';
import { BoardView } from '@/components/BoardView';

// Data changes once a day, so there is nothing to render per-request.
export const revalidate = 3600;

export default function Page() {
  return <BoardView board={getBoard()} />;
}
