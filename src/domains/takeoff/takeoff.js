const MATERIAL_RULES = [
  { material: 'Sink', needles: ['sink installation', 'install sink'] },
  { material: 'Faucet', needles: ['faucet installation', 'install faucet'] },
  { material: 'Toilet', needles: ['toilet installation', 'install toilet'] },
  { material: 'Vanity', needles: ['vanity installation', 'install vanity'] },
  { material: 'Shower kit', needles: ['shower installation', 'install shower'] },
  { material: 'Bathtub', needles: ['bathtub installation', 'tub installation', 'install tub'] },
  { material: 'Appliance', needles: ['appliance installation', 'install appliance'] },
  { material: 'Flooring material', needles: ['flooring installation', 'floor installation'] },
  { material: 'Backsplash tile', needles: ['backsplash installation', 'install backsplash'] },
  { material: 'Paint', needles: ['paint', 'wall prep'] },
];

export function inferMaterials(quotes, priceList) {
  const rows = new Map();
  const materialPriceItems = priceList.filter((item) => String(item.category).toLowerCase() === 'material');

  quotes.forEach((quote) => {
    const existingMaterials = new Set(
      (quote.items || [])
        .filter((item) => String(item.category).toLowerCase() === 'material')
        .map((item) => String(item.name).trim().toLowerCase()),
    );

    (quote.items || []).forEach((item) => {
      const name = String(item.name || '').toLowerCase();
      const rule = MATERIAL_RULES.find((candidate) => candidate.needles.some((needle) => name.includes(needle)));

      if (!rule || existingMaterials.has(rule.material.toLowerCase())) return;

      const saved = materialPriceItems.find((priceItem) => (
        String(priceItem.name).toLowerCase().includes(rule.material.toLowerCase())
      ));
      const key = `${quote.id}:${rule.material}`;
      const previous = rows.get(key);

      rows.set(key, {
        id: key,
        quoteId: quote.id,
        quoteTitle: quote.title || quote.quoteNumber,
        material: rule.material,
        quantity: (previous?.quantity || 0) + (Number(item.quantity) || 1),
        unit: saved?.unit || 'each',
        pricePerUnit: saved?.pricePerUnit || 0,
        reason: `Inferred from "${item.name}"`,
      });
    });
  });

  return [...rows.values()];
}
