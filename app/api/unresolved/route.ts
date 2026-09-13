import { getUnresolved } from '@/lib/data';

export function GET(): Response {
  return Response.json(getUnresolved());
}
