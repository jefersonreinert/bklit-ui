# Cardápios do POS por empresa

Cada arquivo é um argumento de `pos:importMenu` (empresa, perfil, moeda e
produtos). Para carregar ou atualizar uma empresa no Convex:

```bash
cd apps/dashboard
node scripts/pos-menus/import.mjs scripts/pos-menus/vinomad.json
node scripts/pos-menus/import.mjs scripts/pos-menus/the-brew.json
```

O script envia em partes (um argumento de linha de comando tem no máximo
128 KB): a primeira substitui o cardápio, as seguintes acrescentam.

A importação substitui o cardápio da empresa. Produtos com o mesmo `id`
mantêm o estoque e o custo já lançados; produtos que saíram do arquivo são
apagados.

- `vinomad.json`: https://vinomad.eu (menu, carta de vinhos e PDF de comidas).
  Taças de 25/75/125 ml calculadas proporcionalmente ao preço "Drink in" da
  garrafa (arredondado para cima a €0,50). "Takeaway" vira o preço para levar.
- `the-brew.json`: https://thebrewmalta.com (comida, cervejas, gins,
  destilados, coquetéis e vinhos das imagens do site).
- `atlas.json`: https://atlasbar.sg (Singapura, em SGD) — menu de coquetéis,
  "The ATLAS Collections" (gins por estilo, destilados) e a carta de
  champanhes e vinhos. Gins e destilados são vendidos por dose; champanhes e
  vinhos por garrafa (magnum = 1500 ml). Gerado dos PDFs com
  `pdftotext -bbox-layout` (duas colunas lidas pela posição na página).

## Mapas de mesas (`scripts/pos-floors/`)

Substitui as áreas e mesas de uma empresa (usadas pelo POS e pelas Reservas).
Recusa se houver pedido aberto ou reserva futura numa mesa que sairia do mapa.

```bash
node scripts/pos-floors/apply.mjs scripts/pos-floors/vinomad.json
```

- `vinomad.json`: Beer Garden, Inside e Upstairs, desenhados das plantas à mão
  (número dentro = mesa, número fora = lugares; círculo = redonda).
