import { getCustomization } from './customization.js';

// Opções de frete (personalizáveis pelo /admin; padrão = config atual).
export function availableShipping() {
  return getCustomization().shipping;
}

// Valida a opção escolhida (backend nunca confia no front).
export function getShippingOption(id) {
  return availableShipping().find((o) => o.id === id) || null;
}

export default { availableShipping, getShippingOption };
