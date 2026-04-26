import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('MY_PROD_URL') ?? Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('MY_PROD_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let { data: steamPlatform } = await supabase
    .from('platform')
    .select('id')
    .ilike('name', '%steam%')
    .limit(1)
    .maybeSingle();

  let targetPlatformId = steamPlatform?.id;

  if (!targetPlatformId) {
    const { data: fallbackPlatform } = await supabase
      .from('platform')
      .select('id')
      .limit(1)
      .maybeSingle();
    targetPlatformId = fallbackPlatform?.id;
  }

  if (!targetPlatformId) {
    return new Response(JSON.stringify({ error: 'No platforms in DB' }), { status: 400 });
  }

  const { data: games } = await supabase.from('game').select('id, title');
  const logs = [];

  for (const game of games || []) {
    try {
      await delay(1500);

      // Фікс для старих баз даних, які не знають слова Chornobyl
      let title1 = game.title.trim();
      if (title1.includes('Chornobyl')) title1 = title1.replace('Chornobyl', 'Chernobyl');

      // ВИПРАВЛЕНО: Створюємо title2 ТУТ, щоб він був доступний скрізь!
      const title2 = title1.split(/[:\-]/)[0].trim().replace(/\s+1$/i, '');

      let res = await fetch(
        `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(title1)}`
      );
      let data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        res = await fetch(
          `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(title2)}`
        );
        data = await res.json();
      }

      if (Array.isArray(data) && data.length > 0) {
        const tFull = title1.toLowerCase();
        const tShort = title2.toLowerCase();

        // РОЗУМНИЙ ВИБІР З МАСИВУ
        let matchedGame =
          data.find((g: any) => g.external.toLowerCase() === tFull) ||
          data.find((g: any) => g.external.toLowerCase() === tShort);

        if (!matchedGame) {
          const startsWith = data.filter((g: any) => g.external.toLowerCase().startsWith(tShort));
          if (startsWith.length > 0) {
            matchedGame = startsWith.sort(
              (a: any, b: any) => a.external.length - b.external.length
            )[0];
          }
        }

        if (!matchedGame) {
          const includesMatch = data.filter((g: any) => g.external.toLowerCase().includes(tShort));
          if (includesMatch.length > 0) {
            matchedGame = includesMatch.sort(
              (a: any, b: any) => a.external.length - b.external.length
            )[0];
          }
        }

        if (matchedGame) {
          const dealRes = await fetch(
            `https://www.cheapshark.com/api/1.0/games?id=${matchedGame.gameID}`
          );
          const detail = await dealRes.json();

          const allowedStores = ['1', '7', '25']; // Steam, GOG, Epic
          const validDeals =
            detail.deals?.filter((d: any) => allowedStores.includes(d.storeID)) || [];

          let finalPrice = null;

          if (validDeals.length > 0) {
            finalPrice = validDeals[0].price;
          } else if (matchedGame.cheapest) {
            finalPrice = matchedGame.cheapest;
          }

          if (finalPrice) {
            const { error: insertError } = await supabase.from('price_history').insert({
              game_id: game.id,
              price: parseFloat(finalPrice),
              platform_id: targetPlatformId,
              recorded_at: new Date().toISOString()
            });

            if (insertError) {
              logs.push({ game: game.title, error: insertError });
            } else {
              logs.push({
                game: game.title,
                status: 'Success',
                price: finalPrice,
                matchedAs: matchedGame.external
              });
            }
          } else {
            logs.push({ game: game.title, status: 'No valid deals found anywhere' });
          }
        } else {
          logs.push({ game: game.title, status: 'Matched wrong games on CheapShark' });
        }
      } else {
        logs.push({ game: game.title, status: 'Not found on CheapShark', rawResponse: data });
      }
    } catch (e) {
      logs.push({ game: game.title, error: e.message });
    }
  }

  return new Response(
    JSON.stringify({ success: true, platformUsed: targetPlatformId, details: logs }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
