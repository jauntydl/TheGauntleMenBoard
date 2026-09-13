import { getMeta } from '@/lib/data';

export function GET(): Response {
  return Response.json(getMeta());
}
