import { getSeason } from '@/lib/data';

export function GET(req: Request): Response {
  const season = new URL(req.url).searchParams.get('season') ?? undefined;
  const result = getSeason(season);

  if (!result) {
    return Response.json({ error: 'Unknown season' }, { status: 404 });
  }
  return Response.json(result);
}
