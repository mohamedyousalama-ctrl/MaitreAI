import type { Branch, DeliveryArea, MenuItem, Modifier } from "@/lib/types";

export const replayMenuItems: MenuItem[] = [
  {
    id: "item-chocolate-cake",
    name: "كيك شوكولاتة",
    category: "حلويات",
    price: 18,
    available: true,
    description: "قطعة كيك شوكولاتة",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["شوكولاتة", "دقيق", "بيض", "لبن"],
    allergens: ["ألبان", "جلوتين", "بيض"],
  },
  {
    id: "item-cookie",
    name: "كوكيز",
    category: "حلويات",
    price: 9,
    available: true,
    description: "كوكيز مخبوز يومياً",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["دقيق", "زبدة"],
    allergens: ["ألبان", "جلوتين"],
  },
  {
    id: "item-coffee",
    name: "قهوة",
    category: "مشروبات",
    price: 12,
    available: true,
    description: "قهوة ساخنة",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["قهوة"],
    allergens: [],
  },
  {
    id: "item-cheesecake",
    name: "تشيز كيك",
    category: "حلويات",
    price: 22,
    available: true,
    description: "تشيز كيك",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["جبن", "بسكويت"],
    allergens: ["ألبان", "جلوتين"],
  },
  {
    id: "item-brownie",
    name: "براونيز",
    category: "حلويات",
    price: 14,
    available: true,
    description: "براونيز شوكولاتة",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["شوكولاتة", "بيض", "دقيق"],
    allergens: ["بيض", "جلوتين"],
  },
  {
    id: "item-cupcake",
    name: "كب كيك",
    category: "حلويات",
    price: 11,
    available: true,
    description: "كب كيك فانيليا",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["دقيق", "بيض", "لبن"],
    allergens: ["ألبان", "بيض", "جلوتين"],
  },
];

export const replayModifiers: Modifier[] = [];

export const replayBranches: Branch[] = [
  {
    id: "branch-main",
    name: "الفرع الرئيسي",
    address: "ADDRESS_1",
    hours: "يومياً",
    whatsappNumber: "",
    open: true,
    notes: "",
    whatsappConnected: false,
    phone: "",
  },
];

export const replayDeliveryAreas: DeliveryArea[] = [
  {
    id: "zone-central",
    name: "وسط المدينة",
    branchId: "branch-main",
    minOrder: 0,
    deliveryFee: 5,
    estimatedTime: "30 دقيقة",
    active: true,
  },
];
