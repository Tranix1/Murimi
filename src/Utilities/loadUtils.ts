/** Legacy Transix load-analysis helpers retained so older screens remain typed. */
export function createAIPrompt(): string {
  return 'Inspect the cargo image and return JSON with cargoArea, truckType, capacity, tankerType, and reasoning. This feature is unavailable until Murimi AI is configured.';
}

export function mapAIResponse(value: any) {
  const option = (item: any) => item && ({ id: Number(item.id) || 0, name: String(item.name ?? item.label ?? 'Unknown') });
  return {
    cargoArea: option(value.cargoArea),
    truckType: option(value.truckType),
    capacity: option(value.capacity),
    tankerType: option(value.tankerType),
  };
}
