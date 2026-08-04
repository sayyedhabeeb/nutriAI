import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface MealSeed {
  name: string;
  description: string;
  mealType: string;
  cuisine: string;
  isVeg: boolean;
  isVegan: boolean;
  isEggetarian: boolean;
  prepTimeMin: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  aliases: string[];
  tags: string[];
  ingredients: { name: string; allergen: boolean }[];
}

const MEALS: MealSeed[] = [
  // ═══ INDIAN ═══
  { name: 'Chicken Biryani', description: 'Fragrant basmati rice cooked with spiced chicken and saffron', mealType: 'lunch', cuisine: 'Indian', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 45, calories: 175, proteinG: 12, carbsG: 15, fatG: 7, fiberG: 0.5, sugarG: 0.5, sodiumMg: 320, aliases: ['biryani', 'chicken biryani', 'hyderabadi biryani', 'dum biryani'], tags: ['high-protein', 'rice', 'spicy', 'popular'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Basmati Rice', allergen: false }, { name: 'Yogurt', allergen: true }, { name: 'Onions', allergen: false }, { name: 'Saffron', allergen: false }] },
  { name: 'Palak Paneer', description: 'Creamy spinach curry with cottage cheese cubes', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 30, calories: 120, proteinG: 8, carbsG: 5, fatG: 8, fiberG: 3, sugarG: 1.5, sodiumMg: 400, aliases: ['spinach paneer', 'saag paneer', 'palak paneer curry'], tags: ['vegetarian', 'high-protein', 'iron-rich', 'curry'], ingredients: [{ name: 'Paneer', allergen: true }, { name: 'Spinach', allergen: false }, { name: 'Cream', allergen: true }, { name: 'Garlic', allergen: false }, { name: 'Ginger', allergen: false }] },
  { name: 'Masala Dosa', description: 'Crispy rice crepe filled with spiced potato filling', mealType: 'breakfast', cuisine: 'Indian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 25, calories: 150, proteinG: 4, carbsG: 22, fatG: 5, fiberG: 2, sugarG: 1, sodiumMg: 350, aliases: ['dosa', 'masala dosa', 'plain dosa', 'crispy dosa'], tags: ['vegan', 'breakfast', 'gluten-free', 'south-indian'], ingredients: [{ name: 'Rice Batter', allergen: false }, { name: 'Potatoes', allergen: false }, { name: 'Mustard Seeds', allergen: false }, { name: 'Curry Leaves', allergen: false }, { name: 'Oil', allergen: false }] },
  { name: 'Butter Chicken', description: 'Tender chicken in rich tomato-butter cream sauce', mealType: 'dinner', cuisine: 'Indian', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 40, calories: 160, proteinG: 14, carbsG: 5, fatG: 10, fiberG: 0.8, sugarG: 3, sodiumMg: 450, aliases: ['murgh makhani', 'butter chicken curry', 'chicken tikka masala'], tags: ['high-protein', 'creamy', 'popular', 'north-indian'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Tomato', allergen: false }, { name: 'Butter', allergen: true }, { name: 'Cream', allergen: true }, { name: 'Cashew Paste', allergen: true }] },
  { name: 'Chole Bhature', description: 'Spiced chickpea curry served with fried bread', mealType: 'breakfast', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 35, calories: 250, proteinG: 8, carbsG: 30, fatG: 12, fiberG: 5, sugarG: 2, sodiumMg: 380, aliases: ['chole', 'chana masala with bhature', 'chickpea curry'], tags: ['vegetarian', 'high-calorie', 'north-indian', 'comfort-food'], ingredients: [{ name: 'Chickpeas', allergen: false }, { name: 'Maida Flour', allergen: true }, { name: 'Onions', allergen: false }, { name: 'Tomatoes', allergen: false }, { name: 'Ghee', allergen: true }] },
  { name: 'Idli Sambar', description: 'Steamed rice cakes served with lentil vegetable stew', mealType: 'breakfast', cuisine: 'Indian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 30, calories: 100, proteinG: 4, carbsG: 18, fatG: 1, fiberG: 2, sugarG: 0.5, sodiumMg: 300, aliases: ['idli', 'sambar', 'idli with sambar'], tags: ['vegan', 'low-fat', 'breakfast', 'south-indian'], ingredients: [{ name: 'Rice Batter', allergen: false }, { name: 'Lentils', allergen: false }, { name: 'Vegetables', allergen: false }, { name: 'Tamarind', allergen: false }, { name: 'Mustard Seeds', allergen: false }] },
  { name: 'Paneer Tikka', description: 'Grilled cottage cheese marinated in spiced yogurt', mealType: 'snack', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 20, calories: 180, proteinG: 14, carbsG: 4, fatG: 13, fiberG: 0.3, sugarG: 1, sodiumMg: 350, aliases: ['tikka paneer', 'grilled paneer', 'paneer kebab'], tags: ['vegetarian', 'high-protein', 'grilled', 'appetizer'], ingredients: [{ name: 'Paneer', allergen: true }, { name: 'Yogurt', allergen: true }, { name: 'Bell Peppers', allergen: false }, { name: 'Onions', allergen: false }, { name: 'Spices', allergen: false }] },
  { name: 'Dal Makhani', description: 'Slow-cooked black lentils in creamy butter sauce', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 45, calories: 110, proteinG: 6, carbsG: 10, fatG: 6, fiberG: 4, sugarG: 1, sodiumMg: 380, aliases: ['black dal', 'maa ki dal', 'dal makhani curry'], tags: ['vegetarian', 'high-fiber', 'comfort-food', 'north-indian'], ingredients: [{ name: 'Black Lentils', allergen: false }, { name: 'Butter', allergen: true }, { name: 'Cream', allergen: true }, { name: 'Ginger', allergen: false }, { name: 'Garlic', allergen: false }] },
  { name: 'Rajma Chawal', description: 'Kidney bean curry served with steamed rice', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 40, calories: 130, proteinG: 6, carbsG: 20, fatG: 3, fiberG: 5, sugarG: 1, sodiumMg: 320, aliases: ['rajma rice', 'kidney beans curry', 'rajma'], tags: ['vegan', 'high-fiber', 'comfort-food', 'north-indian'], ingredients: [{ name: 'Kidney Beans', allergen: false }, { name: 'Rice', allergen: false }, { name: 'Onions', allergen: false }, { name: 'Tomatoes', allergen: false }, { name: 'Spices', allergen: false }] },
  { name: 'Aloo Gobi', description: 'Dry curry of potatoes and cauliflower with spices', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 25, calories: 90, proteinG: 3, carbsG: 14, fatG: 3, fiberG: 3, sugarG: 1.5, sodiumMg: 280, aliases: ['aloo gobi', 'potato cauliflower', 'gobi aloo'], tags: ['vegan', 'gluten-free', 'low-calorie'], ingredients: [{ name: 'Potatoes', allergen: false }, { name: 'Cauliflower', allergen: false }, { name: 'Turmeric', allergen: false }, { name: 'Cumin', allergen: false }, { name: 'Green Chilies', allergen: false }] },
  { name: 'Tandoori Chicken', description: 'Chicken marinated in yogurt and spices, cooked in clay oven', mealType: 'dinner', cuisine: 'Indian', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 35, calories: 165, proteinG: 22, carbsG: 2, fatG: 8, fiberG: 0.2, sugarG: 0.5, sodiumMg: 350, aliases: ['tandoori', 'grilled chicken', 'chicken tandoori'], tags: ['high-protein', 'low-carb', 'grilled', 'keto-friendly'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Yogurt', allergen: true }, { name: 'Lemon Juice', allergen: false }, { name: 'Red Chili Powder', allergen: false }, { name: 'Garam Masala', allergen: false }] },
  { name: 'Hyderabadi Veg Biryani', description: 'Fragrant basmati rice layered with mixed vegetables and spices', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 45, calories: 155, proteinG: 4, carbsG: 22, fatG: 6, fiberG: 2.5, sugarG: 1, sodiumMg: 300, aliases: ['veg biryani', 'vegetable biryani'], tags: ['vegetarian', 'rice', 'aromatic'], ingredients: [{ name: 'Basmati Rice', allergen: false }, { name: 'Mixed Vegetables', allergen: false }, { name: 'Saffron', allergen: false }, { name: 'Yogurt', allergen: true }, { name: 'Cashews', allergen: true }] },
  // ═══ CHINESE ═══
  { name: 'Kung Pao Chicken', description: 'Spicy stir-fried chicken with peanuts and vegetables', mealType: 'dinner', cuisine: 'Chinese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 140, proteinG: 15, carbsG: 8, fatG: 6, fiberG: 1.5, sugarG: 4, sodiumMg: 520, aliases: ['kung pao', 'gong bao chicken', 'spicy chicken peanuts'], tags: ['high-protein', 'spicy', 'stir-fry'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Peanuts', allergen: true }, { name: 'Bell Peppers', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Dried Chilies', allergen: false }] },
  { name: 'Vegetable Fried Rice', description: 'Wok-fried rice with mixed vegetables and soy sauce', mealType: 'lunch', cuisine: 'Chinese', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 15, calories: 160, proteinG: 4, carbsG: 28, fatG: 4, fiberG: 2, sugarG: 1.5, sodiumMg: 480, aliases: ['fried rice', 'veg fried rice', 'chinese fried rice'], tags: ['vegan', 'quick-meal', 'rice'], ingredients: [{ name: 'Rice', allergen: false }, { name: 'Carrots', allergen: false }, { name: 'Peas', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Sesame Oil', allergen: false }] },
  { name: 'Spring Rolls', description: 'Crispy fried rolls filled with vegetables', mealType: 'snack', cuisine: 'Chinese', isVeg: true, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 200, proteinG: 4, carbsG: 22, fatG: 10, fiberG: 1.5, sugarG: 1, sodiumMg: 350, aliases: ['egg rolls', 'veggie rolls', 'crispy rolls'], tags: ['vegetarian', 'fried', 'appetizer'], ingredients: [{ name: 'Spring Roll Wrapper', allergen: true }, { name: 'Cabbage', allergen: false }, { name: 'Carrots', allergen: false }, { name: 'Mushrooms', allergen: false }, { name: 'Soy Sauce', allergen: false }] },
  { name: 'Hot and Sour Soup', description: 'Tangy spicy soup with tofu, mushrooms and bamboo shoots', mealType: 'snack', cuisine: 'Chinese', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 15, calories: 45, proteinG: 3, carbsG: 5, fatG: 1.5, fiberG: 0.8, sugarG: 1, sodiumMg: 550, aliases: ['hot sour soup', 'chinese soup'], tags: ['low-calorie', 'soup', 'spicy'], ingredients: [{ name: 'Tofu', allergen: false }, { name: 'Mushrooms', allergen: false }, { name: 'Bamboo Shoots', allergen: false }, { name: 'Vinegar', allergen: false }, { name: 'Egg', allergen: true }] },
  { name: 'Manchurian', description: 'Deep-fried vegetable balls in tangy soy-chili sauce', mealType: 'snack', cuisine: 'Chinese', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 25, calories: 180, proteinG: 5, carbsG: 18, fatG: 10, fiberG: 2, sugarG: 5, sodiumMg: 420, aliases: ['veg manchurian', 'gobi manchurian', 'indian chinese'], tags: ['vegetarian', ' Indo-Chinese', 'fried'], ingredients: [{ name: 'Cabbage', allergen: false }, { name: 'Corn Flour', allergen: true }, { name: 'Soy Sauce', allergen: false }, { name: 'Chili Sauce', allergen: false }, { name: 'Onions', allergen: false }] },
  { name: 'Chow Mein', description: 'Stir-fried noodles with vegetables and soy sauce', mealType: 'lunch', cuisine: 'Chinese', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 15, calories: 150, proteinG: 5, carbsG: 24, fatG: 4, fiberG: 2, sugarG: 2, sodiumMg: 500, aliases: ['chow mein noodles', 'stir fry noodles', 'veg chow mein'], tags: ['vegan', 'noodles', 'quick-meal'], ingredients: [{ name: 'Noodles', allergen: true }, { name: 'Cabbage', allergen: false }, { name: 'Carrots', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Sesame Oil', allergen: false }] },
  { name: 'Sweet and Sour Chicken', description: 'Crispy chicken in tangy sweet and sour sauce with pineapple', mealType: 'dinner', cuisine: 'Chinese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 170, proteinG: 12, carbsG: 18, fatG: 5, fiberG: 0.8, sugarG: 8, sodiumMg: 450, aliases: ['sweet sour chicken', 'tangy chicken'], tags: ['sweet', 'fried', 'popular'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Pineapple', allergen: false }, { name: 'Bell Peppers', allergen: false }, { name: 'Cornstarch', allergen: false }, { name: 'Sugar', allergen: false }] },
  // ═══ ITALIAN ═══
  { name: 'Margherita Pizza', description: 'Classic pizza with tomato sauce, mozzarella and basil', mealType: 'dinner', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 25, calories: 270, proteinG: 12, carbsG: 33, fatG: 10, fiberG: 2, sugarG: 3.5, sodiumMg: 580, aliases: ['pizza margherita', 'cheese pizza', 'classic pizza'], tags: ['vegetarian', 'cheese', 'popular', 'comfort-food'], ingredients: [{ name: 'Pizza Dough', allergen: true }, { name: 'Mozzarella Cheese', allergen: true }, { name: 'Tomato Sauce', allergen: false }, { name: 'Basil', allergen: false }, { name: 'Olive Oil', allergen: false }] },
  { name: 'Pasta Alfredo', description: 'Fettuccine pasta in creamy parmesan cheese sauce', mealType: 'lunch', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 20, calories: 200, proteinG: 8, carbsG: 25, fatG: 8, fiberG: 1, sugarG: 1, sodiumMg: 380, aliases: ['alfredo pasta', 'fettuccine alfredo', 'cream pasta'], tags: ['vegetarian', 'creamy', 'pasta', 'comfort-food'], ingredients: [{ name: 'Fettuccine', allergen: true }, { name: 'Parmesan Cheese', allergen: true }, { name: 'Butter', allergen: true }, { name: 'Cream', allergen: true }, { name: 'Garlic', allergen: false }] },
  { name: 'Caesar Salad', description: 'Romaine lettuce with croutons, parmesan and caesar dressing', mealType: 'lunch', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 120, proteinG: 6, carbsG: 6, fatG: 8, fiberG: 2, sugarG: 1.5, sodiumMg: 420, aliases: ['caesar', 'romaine salad', 'caesar salad'], tags: ['vegetarian', 'salad', 'low-calorie'], ingredients: [{ name: 'Romaine Lettuce', allergen: false }, { name: 'Croutons', allergen: true }, { name: 'Parmesan Cheese', allergen: true }, { name: 'Caesar Dressing', allergen: true }, { name: 'Anchovies', allergen: true }] },
  { name: 'Bruschetta', description: 'Toasted bread topped with fresh tomatoes, basil and olive oil', mealType: 'snack', cuisine: 'Italian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 130, proteinG: 3, carbsG: 18, fatG: 5, fiberG: 1.5, sugarG: 2, sodiumMg: 280, aliases: ['tomato bruschetta', 'italian toast'], tags: ['vegan', 'appetizer', 'fresh'], ingredients: [{ name: 'Bread', allergen: true }, { name: 'Tomatoes', allergen: false }, { name: 'Basil', allergen: false }, { name: 'Olive Oil', allergen: false }, { name: 'Garlic', allergen: false }] },
  { name: 'Minestrone Soup', description: 'Hearty vegetable soup with pasta and beans', mealType: 'lunch', cuisine: 'Italian', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 35, calories: 55, proteinG: 3, carbsG: 8, fatG: 1.5, fiberG: 2.5, sugarG: 2, sodiumMg: 380, aliases: ['minestrone', 'italian vegetable soup'], tags: ['vegan', 'low-calorie', 'soup', 'high-fiber'], ingredients: [{ name: 'Mixed Vegetables', allergen: false }, { name: 'Cannellini Beans', allergen: false }, { name: 'Small Pasta', allergen: true }, { name: 'Tomatoes', allergen: false }, { name: 'Herbs', allergen: false }] },
  { name: 'Risotto ai Funghi', description: 'Creamy arborio rice with wild mushrooms and parmesan', mealType: 'dinner', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 35, calories: 145, proteinG: 4, carbsG: 22, fatG: 4.5, fiberG: 1.5, sugarG: 0.8, sodiumMg: 350, aliases: ['mushroom risotto', 'funghi risotto'], tags: ['vegetarian', 'mushroom', 'comfort-food'], ingredients: [{ name: 'Arborio Rice', allergen: false }, { name: 'Wild Mushrooms', allergen: false }, { name: 'Parmesan Cheese', allergen: true }, { name: 'White Wine', allergen: false }, { name: 'Onion', allergen: false }] },
  // ═══ JAPANESE ═══
  { name: 'Sushi Roll', description: 'Vinegared rice with fish and vegetables wrapped in nori', mealType: 'lunch', cuisine: 'Japanese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 30, calories: 150, proteinG: 7, carbsG: 22, fatG: 3, fiberG: 1, sugarG: 2.5, sodiumMg: 480, aliases: ['maki roll', 'sushi', 'nori roll'], tags: ['fish', 'rice', 'japanese', 'fresh'], ingredients: [{ name: 'Sushi Rice', allergen: false }, { name: 'Nori Seaweed', allergen: false }, { name: 'Salmon', allergen: false }, { name: 'Avocado', allergen: false }, { name: 'Soy Sauce', allergen: false }] },
  { name: 'Ramen', description: 'Rich pork broth noodles with egg, chashu and vegetables', mealType: 'dinner', cuisine: 'Japanese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 45, calories: 180, proteinG: 10, carbsG: 24, fatG: 5, fiberG: 1.5, sugarG: 2, sodiumMg: 650, aliases: ['japanese ramen', 'pork ramen', 'tonkotsu ramen'], tags: ['soup', 'noodles', 'comfort-food', 'high-sodium'], ingredients: [{ name: 'Ramen Noodles', allergen: true }, { name: 'Pork Broth', allergen: false }, { name: 'Chashu Pork', allergen: false }, { name: 'Egg', allergen: true }, { name: 'Green Onions', allergen: false }] },
  { name: 'Chicken Teriyaki Bowl', description: 'Grilled chicken in sweet soy glaze over steamed rice', mealType: 'dinner', cuisine: 'Japanese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 25, calories: 190, proteinG: 16, carbsG: 22, fatG: 5, fiberG: 0.5, sugarG: 6, sodiumMg: 520, aliases: ['teriyaki chicken', 'chicken teriyaki bowl', 'teriyaki don'], tags: ['high-protein', 'rice-bowl', 'japanese', 'sweet'], ingredients: [{ name: 'Chicken Thigh', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Rice', allergen: false }, { name: 'Sugar', allergen: false }, { name: 'Ginger', allergen: false }] },
  { name: 'Edamame', description: 'Steamed young soybeans with sea salt', mealType: 'snack', cuisine: 'Japanese', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 5, calories: 120, proteinG: 11, carbsG: 9, fatG: 5, fiberG: 5, sugarG: 2, sodiumMg: 150, aliases: ['steamed edamame', 'soybeans', 'japanese beans'], tags: ['vegan', 'high-protein', 'high-fiber', 'low-calorie'], ingredients: [{ name: 'Soybeans', allergen: false }, { name: 'Sea Salt', allergen: false }] },
  { name: 'Miso Soup', description: 'Traditional Japanese soybean paste soup with tofu', mealType: 'snack', cuisine: 'Japanese', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 30, proteinG: 2, carbsG: 3, fatG: 1, fiberG: 0.5, sugarG: 1, sodiumMg: 420, aliases: ['miso', 'japanese soup', 'tofu soup'], tags: ['low-calorie', 'soup', 'probiotic'], ingredients: [{ name: 'Miso Paste', allergen: false }, { name: 'Tofu', allergen: false }, { name: 'Seaweed', allergen: false }, { name: 'Green Onions', allergen: false }] },
  // ═══ AMERICAN ═══
  { name: 'Grilled Chicken Breast', description: 'Seasoned and grilled boneless chicken breast', mealType: 'dinner', cuisine: 'American', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0, sugarG: 0, sodiumMg: 74, aliases: ['grilled chicken', 'chicken breast', 'plain chicken'], tags: ['high-protein', 'low-carb', 'keto-friendly', 'lean'], ingredients: [{ name: 'Chicken Breast', allergen: false }, { name: 'Olive Oil', allergen: false }, { name: 'Black Pepper', allergen: false }, { name: 'Salt', allergen: false }] },
  { name: 'Classic Burger', description: 'Beef patty with lettuce, tomato, onion and special sauce', mealType: 'lunch', cuisine: 'American', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 15, calories: 295, proteinG: 17, carbsG: 24, fatG: 14, fiberG: 1.5, sugarG: 5, sodiumMg: 520, aliases: ['hamburger', 'beef burger', 'cheeseburger'], tags: ['high-protein', 'popular', 'comfort-food'], ingredients: [{ name: 'Beef Patty', allergen: false }, { name: 'Burger Bun', allergen: true }, { name: 'Lettuce', allergen: false }, { name: 'Tomato', allergen: false }, { name: 'Cheddar Cheese', allergen: true }] },
  { name: 'Caesar Wrap', description: 'Chicken caesar salad wrapped in a flour tortilla', mealType: 'lunch', cuisine: 'American', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 10, calories: 220, proteinG: 14, carbsG: 20, fatG: 9, fiberG: 1.5, sugarG: 2, sodiumMg: 480, aliases: ['chicken wrap', 'caesar chicken wrap'], tags: ['high-protein', 'wrap', 'quick-meal'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Flour Tortilla', allergen: true }, { name: 'Romaine Lettuce', allergen: false }, { name: 'Parmesan', allergen: true }, { name: 'Caesar Dressing', allergen: true }] },
  { name: 'Mac and Cheese', description: 'Creamy cheddar macaroni baked to golden perfection', mealType: 'lunch', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 25, calories: 200, proteinG: 7, carbsG: 25, fatG: 8, fiberG: 0.8, sugarG: 2, sodiumMg: 450, aliases: ['macaroni cheese', 'mac cheese', 'baked mac'], tags: ['vegetarian', 'comfort-food', 'cheese', 'pasta'], ingredients: [{ name: 'Macaroni', allergen: true }, { name: 'Cheddar Cheese', allergen: true }, { name: 'Milk', allergen: true }, { name: 'Butter', allergen: true }, { name: 'Flour', allergen: true }] },
  { name: 'Pancakes with Maple Syrup', description: 'Fluffy buttermilk pancakes drizzled with maple syrup', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 15, calories: 220, proteinG: 6, carbsG: 38, fatG: 5, fiberG: 1, sugarG: 10, sodiumMg: 350, aliases: ['pancakes', 'fluffy pancakes', 'buttermilk pancakes'], tags: ['vegetarian', 'breakfast', 'sweet', 'comfort-food'], ingredients: [{ name: 'Flour', allergen: true }, { name: 'Buttermilk', allergen: true }, { name: 'Eggs', allergen: true }, { name: 'Maple Syrup', allergen: false }, { name: 'Butter', allergen: true }] },
  { name: 'BBQ Chicken Wings', description: 'Crispy chicken wings glazed with smoky barbecue sauce', mealType: 'snack', cuisine: 'American', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 35, calories: 240, proteinG: 18, carbsG: 10, fatG: 14, fiberG: 0.3, sugarG: 6, sodiumMg: 480, aliases: ['chicken wings', 'bbq wings', 'buffalo wings'], tags: ['high-protein', 'fried', 'party-food'], ingredients: [{ name: 'Chicken Wings', allergen: false }, { name: 'BBQ Sauce', allergen: false }, { name: 'Hot Sauce', allergen: false }, { name: 'Garlic Powder', allergen: false }, { name: 'Butter', allergen: true }] },
  // ═══ MEXICAN ═══
  { name: 'Chicken Tacos', description: 'Soft corn tortillas filled with seasoned chicken, salsa and guacamole', mealType: 'lunch', cuisine: 'Mexican', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 200, proteinG: 10, carbsG: 18, fatG: 10, fiberG: 3, sugarG: 2, sodiumMg: 420, aliases: ['tacos', 'mexican tacos', 'chicken tacos'], tags: ['high-protein', 'mexican', 'popular'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Corn Tortillas', allergen: false }, { name: 'Salsa', allergen: false }, { name: 'Guacamole', allergen: false }, { name: 'Lime', allergen: false }] },
  { name: 'Bean Burrito', description: 'Large flour tortilla filled with refried beans, rice and cheese', mealType: 'lunch', cuisine: 'Mexican', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 15, calories: 220, proteinG: 8, carbsG: 32, fatG: 6, fiberG: 5, sugarG: 1.5, sodiumMg: 520, aliases: ['burrito', 'bean burrito', 'veg burrito'], tags: ['vegetarian', 'high-fiber', 'mexican'], ingredients: [{ name: 'Flour Tortilla', allergen: true }, { name: 'Refried Beans', allergen: false }, { name: 'Rice', allergen: false }, { name: 'Cheese', allergen: true }, { name: 'Sour Cream', allergen: true }] },
  { name: 'Guacamole with Chips', description: 'Fresh avocado dip with crispy tortilla chips', mealType: 'snack', cuisine: 'Mexican', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 160, proteinG: 2, carbsG: 14, fatG: 11, fiberG: 4, sugarG: 1, sodiumMg: 280, aliases: ['guacamole', 'avocado dip', 'nachos guacamole'], tags: ['vegan', 'healthy-fat', 'appetizer'], ingredients: [{ name: 'Avocado', allergen: false }, { name: 'Lime', allergen: false }, { name: 'Tomato', allergen: false }, { name: 'Onion', allergen: false }, { name: 'Tortilla Chips', allergen: true }] },
  { name: 'Enchiladas', description: 'Corn tortillas stuffed with chicken, smothered in red sauce and cheese', mealType: 'dinner', cuisine: 'Mexican', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 35, calories: 190, proteinG: 12, carbsG: 16, fatG: 9, fiberG: 1.5, sugarG: 2, sodiumMg: 480, aliases: ['chicken enchiladas', 'enchilada', 'red enchiladas'], tags: ['mexican', 'cheese', 'comfort-food'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Corn Tortillas', allergen: false }, { name: 'Enchilada Sauce', allergen: false }, { name: 'Cheddar Cheese', allergen: true }, { name: 'Onions', allergen: false }] },
  // ═══ MEDITERRANEAN ═══
  { name: 'Greek Salad', description: 'Fresh cucumber, tomatoes, olives and feta with olive oil dressing', mealType: 'lunch', cuisine: 'Mediterranean', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 95, proteinG: 4, carbsG: 5, fatG: 7, fiberG: 1.5, sugarG: 3, sodiumMg: 350, aliases: ['greek salad', 'horiatiki', 'feta salad'], tags: ['vegetarian', 'salad', 'fresh', 'mediterranean'], ingredients: [{ name: 'Cucumber', allergen: false }, { name: 'Tomatoes', allergen: false }, { name: 'Feta Cheese', allergen: true }, { name: 'Kalamata Olives', allergen: false }, { name: 'Olive Oil', allergen: false }] },
  { name: 'Hummus with Pita', description: 'Creamy chickpea dip served with warm pita bread', mealType: 'snack', cuisine: 'Mediterranean', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 170, proteinG: 6, carbsG: 22, fatG: 7, fiberG: 4, sugarG: 1.5, sodiumMg: 380, aliases: ['hummus', 'chickpea dip', 'hummus pita'], tags: ['vegan', 'high-fiber', 'plant-protein', 'appetizer'], ingredients: [{ name: 'Chickpeas', allergen: false }, { name: 'Tahini', allergen: false }, { name: 'Lemon', allergen: false }, { name: 'Garlic', allergen: false }, { name: 'Pita Bread', allergen: true }] },
  { name: 'Grilled Salmon', description: 'Mediterranean herb-crusted salmon fillet with lemon', mealType: 'dinner', cuisine: 'Mediterranean', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 208, proteinG: 20, carbsG: 0, fatG: 13, fiberG: 0, sugarG: 0, sodiumMg: 60, aliases: ['salmon fillet', 'herb salmon', 'grilled salmon'], tags: ['high-protein', 'omega-3', 'keto-friendly', 'lean'], ingredients: [{ name: 'Salmon Fillet', allergen: false }, { name: 'Olive Oil', allergen: false }, { name: 'Lemon', allergen: false }, { name: 'Herbs de Provence', allergen: false }, { name: 'Garlic', allergen: false }] },
  { name: 'Shakshuka', description: 'Poached eggs in spiced tomato and pepper sauce', mealType: 'breakfast', cuisine: 'Mediterranean', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 20, calories: 110, proteinG: 7, carbsG: 7, fatG: 6, fiberG: 2, sugarG: 4, sodiumMg: 320, aliases: ['eggs in tomato sauce', 'middle eastern eggs', 'shakshouka'], tags: ['vegetarian', 'breakfast', 'low-carb'], ingredients: [{ name: 'Eggs', allergen: true }, { name: 'Tomatoes', allergen: false }, { name: 'Bell Peppers', allergen: false }, { name: 'Onion', allergen: false }, { name: 'Cumin', allergen: false }] },
  { name: 'Falafel Wrap', description: 'Crispy spiced chickpea fritters in pita with tahini sauce', mealType: 'lunch', cuisine: 'Mediterranean', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 25, calories: 185, proteinG: 7, carbsG: 24, fatG: 7, fiberG: 5, sugarG: 2, sodiumMg: 420, aliases: ['falafel', 'falafel pita', 'chickpea fritters'], tags: ['vegan', 'high-fiber', 'plant-protein'], ingredients: [{ name: 'Chickpeas', allergen: false }, { name: 'Parsley', allergen: false }, { name: 'Cumin', allergen: false }, { name: 'Tahini', allergen: false }, { name: 'Pita Bread', allergen: true }] },
  // ═══ THAI ═══
  { name: 'Pad Thai', description: 'Stir-fried rice noodles with shrimp, peanuts and tamarind sauce', mealType: 'dinner', cuisine: 'Thai', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 170, proteinG: 6, carbsG: 25, fatG: 5, fiberG: 1.5, sugarG: 5, sodiumMg: 500, aliases: ['pad thai noodles', 'thai noodles', 'shrimp pad thai'], tags: ['popular', 'noodles', 'thai'], ingredients: [{ name: 'Rice Noodles', allergen: false }, { name: 'Shrimp', allergen: true }, { name: 'Peanuts', allergen: true }, { name: 'Tamarind Paste', allergen: false }, { name: 'Egg', allergen: true }] },
  { name: 'Green Curry', description: 'Coconut milk curry with chicken and Thai vegetables', mealType: 'dinner', cuisine: 'Thai', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 25, calories: 155, proteinG: 12, carbsG: 8, fatG: 9, fiberG: 1.5, sugarG: 3, sodiumMg: 480, aliases: ['thai green curry', 'green curry chicken', 'coconut curry'], tags: ['spicy', 'coconut', 'curry'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Coconut Milk', allergen: false }, { name: 'Green Curry Paste', allergen: false }, { name: 'Thai Basil', allergen: false }, { name: 'Bamboo Shoots', allergen: false }] },
  { name: 'Tom Yum Soup', description: 'Spicy and sour Thai soup with shrimp and mushrooms', mealType: 'snack', cuisine: 'Thai', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 55, proteinG: 5, carbsG: 4, fatG: 2, fiberG: 0.5, sugarG: 1, sodiumMg: 580, aliases: ['tom yum', 'thai soup', 'hot and sour soup thai'], tags: ['low-calorie', 'soup', 'spicy', 'thai'], ingredients: [{ name: 'Shrimp', allergen: true }, { name: 'Mushrooms', allergen: false }, { name: 'Lemongrass', allergen: false }, { name: 'Lime', allergen: false }, { name: 'Chili', allergen: false }] },
  { name: 'Thai Basil Chicken', description: 'Stir-fried minced chicken with holy basil and chili', mealType: 'dinner', cuisine: 'Thai', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 15, calories: 150, proteinG: 16, carbsG: 6, fatG: 7, fiberG: 0.8, sugarG: 2, sodiumMg: 420, aliases: ['pad kra pao', 'basil chicken', 'thai basil stir fry'], tags: ['high-protein', 'spicy', 'stir-fry', 'quick-meal'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Thai Basil', allergen: false }, { name: 'Garlic', allergen: false }, { name: 'Chili', allergen: false }, { name: 'Fish Sauce', allergen: false }] },
  // ═══ BREAKFAST / UNIVERSAL ═══
  { name: 'Oatmeal Bowl', description: 'Warm oats topped with banana, berries and honey', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 70, proteinG: 2.5, carbsG: 12, fatG: 1.5, fiberG: 1.8, sugarG: 3, sodiumMg: 5, aliases: ['oatmeal', 'porridge', 'oats bowl'], tags: ['vegetarian', 'high-fiber', 'breakfast', 'heart-healthy'], ingredients: [{ name: 'Rolled Oats', allergen: false }, { name: 'Banana', allergen: false }, { name: 'Blueberries', allergen: false }, { name: 'Honey', allergen: false }, { name: 'Milk', allergen: true }] },
  { name: 'Greek Yogurt Parfait', description: 'Layers of Greek yogurt, granola and mixed berries', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 5, calories: 80, proteinG: 6, carbsG: 10, fatG: 2, fiberG: 0.8, sugarG: 6, sodiumMg: 35, aliases: ['yogurt parfait', 'berry parfait', 'greek yogurt'], tags: ['vegetarian', 'high-protein', 'breakfast', 'probiotic'], ingredients: [{ name: 'Greek Yogurt', allergen: true }, { name: 'Granola', allergen: true }, { name: 'Mixed Berries', allergen: false }, { name: 'Honey', allergen: false }] },
  { name: 'Scrambled Eggs', description: 'Fluffy scrambled eggs with butter and herbs', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 8, calories: 148, proteinG: 10, carbsG: 1, fatG: 11, fiberG: 0, sugarG: 0.5, sodiumMg: 170, aliases: ['eggs', 'scrambled eggs', 'butter eggs'], tags: ['vegetarian', 'high-protein', 'low-carb', 'keto-friendly'], ingredients: [{ name: 'Eggs', allergen: true }, { name: 'Butter', allergen: true }, { name: 'Milk', allergen: true }, { name: 'Chives', allergen: false }, { name: 'Salt', allergen: false }] },
  { name: 'Avocado Toast', description: 'Smashed avocado on sourdough with cherry tomatoes', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 8, calories: 180, proteinG: 4, carbsG: 18, fatG: 11, fiberG: 4, sugarG: 1.5, sodiumMg: 280, aliases: ['avo toast', 'avocado on toast'], tags: ['vegan', 'healthy-fat', 'breakfast', 'trending'], ingredients: [{ name: 'Sourdough Bread', allergen: true }, { name: 'Avocado', allergen: false }, { name: 'Cherry Tomatoes', allergen: false }, { name: 'Lemon', allergen: false }, { name: 'Red Pepper Flakes', allergen: false }] },
  { name: 'Smoothie Bowl', description: 'Thick blended acai berry smoothie topped with granola and fruits', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 95, proteinG: 3, carbsG: 16, fatG: 2.5, fiberG: 3, sugarG: 8, sodiumMg: 20, aliases: ['acai bowl', 'smoothie bowl', 'berry bowl'], tags: ['vegan', 'breakfast', 'antioxidant', 'trending'], ingredients: [{ name: 'Acai Puree', allergen: false }, { name: 'Banana', allergen: false }, { name: 'Granola', allergen: true }, { name: 'Blueberries', allergen: false }, { name: 'Chia Seeds', allergen: false }] },
  // ═══ SNACKS & MORE ═══
  { name: 'Protein Bar', description: 'Chocolate whey protein energy bar with nuts', mealType: 'snack', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 0, calories: 350, proteinG: 20, carbsG: 40, fatG: 12, fiberG: 5, sugarG: 15, sodiumMg: 200, aliases: ['energy bar', 'protein bar', 'nutrition bar'], tags: ['high-protein', 'on-the-go', 'post-workout'], ingredients: [{ name: 'Whey Protein', allergen: true }, { name: 'Oats', allergen: false }, { name: 'Peanuts', allergen: true }, { name: 'Chocolate', allergen: true }, { name: 'Honey', allergen: false }] },
  { name: 'Mixed Nuts', description: 'Roasted almonds, cashews and walnuts mix', mealType: 'snack', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 0, calories: 580, proteinG: 20, carbsG: 20, fatG: 50, fiberG: 7, sugarG: 4, sodiumMg: 10, aliases: ['trail mix', 'nuts', 'mixed nuts roasted'], tags: ['vegan', 'healthy-fat', 'high-protein', 'keto-friendly'], ingredients: [{ name: 'Almonds', allergen: true }, { name: 'Cashews', allergen: true }, { name: 'Walnuts', allergen: true }, { name: 'Peanuts', allergen: true }] },
  { name: 'Fruit Salad', description: 'Fresh seasonal fruits with a drizzle of honey and lime', mealType: 'snack', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 45, proteinG: 0.5, carbsG: 11, fatG: 0.2, fiberG: 1.5, sugarG: 8, sodiumMg: 2, aliases: ['fruit bowl', 'mixed fruit', 'fresh fruit salad'], tags: ['vegan', 'low-calorie', 'vitamin-c', 'refreshing'], ingredients: [{ name: 'Watermelon', allergen: false }, { name: 'Pineapple', allergen: false }, { name: 'Mango', allergen: false }, { name: 'Grapes', allergen: false }, { name: 'Mint', allergen: false }] },
  { name: 'Grilled Paneer Tikka Plate', description: 'Smoky grilled paneer with mint chutney and salad', mealType: 'dinner', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 20, calories: 190, proteinG: 14, carbsG: 5, fatG: 14, fiberG: 0.5, sugarG: 1.5, sodiumMg: 380, aliases: ['paneer tikka plate', 'tikka platter'], tags: ['vegetarian', 'high-protein', 'grilled'], ingredients: [{ name: 'Paneer', allergen: true }, { name: 'Bell Peppers', allergen: false }, { name: 'Onions', allergen: false }, { name: 'Mint Chutney', allergen: false }, { name: 'Yogurt', allergen: true }] },
  { name: 'Chicken Shawarma Wrap', description: 'Spiced grilled chicken in pita with garlic sauce and pickles', mealType: 'lunch', cuisine: 'Mediterranean', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 230, proteinG: 16, carbsG: 20, fatG: 9, fiberG: 1.5, sugarG: 3, sodiumMg: 520, aliases: ['shawarma', 'chicken shawarma', 'shawarma wrap'], tags: ['high-protein', 'mediterranean', 'wrap'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Pita Bread', allergen: true }, { name: 'Garlic Sauce', allergen: false }, { name: 'Pickles', allergen: false }, { name: 'Lettuce', allergen: false }] },
  { name: 'Veggie Stir Fry', description: 'Mixed vegetables stir-fried in soy-ginger sauce', mealType: 'dinner', cuisine: 'Chinese', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 12, calories: 75, proteinG: 3, carbsG: 8, fatG: 3.5, fiberG: 2.5, sugarG: 3, sodiumMg: 350, aliases: ['vegetable stir fry', 'mixed veg stir fry'], tags: ['vegan', 'low-calorie', 'quick-meal', 'high-fiber'], ingredients: [{ name: 'Broccoli', allergen: false }, { name: 'Bell Peppers', allergen: false }, { name: 'Snap Peas', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Ginger', allergen: false }] },
  { name: 'Tofu Bowl', description: 'Crispy teriyaki tofu over brown rice with vegetables', mealType: 'lunch', cuisine: 'Japanese', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 20, calories: 155, proteinG: 8, carbsG: 22, fatG: 4.5, fiberG: 3, sugarG: 4, sodiumMg: 380, aliases: ['tofu rice bowl', 'teriyaki tofu', 'buddha bowl'], tags: ['vegan', 'plant-protein', 'healthy', 'bowl'], ingredients: [{ name: 'Tofu', allergen: false }, { name: 'Brown Rice', allergen: false }, { name: 'Broccoli', allergen: false }, { name: 'Teriyaki Sauce', allergen: false }, { name: 'Sesame Seeds', allergen: false }] },
  { name: 'Egg Bhurji', description: 'Spiced Indian-style scrambled eggs with onions and tomatoes', mealType: 'breakfast', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 160, proteinG: 11, carbsG: 4, fatG: 12, fiberG: 0.5, sugarG: 1.5, sodiumMg: 320, aliases: ['anday ka bhurji', 'indian scrambled eggs', 'egg bhurji'], tags: ['vegetarian', 'high-protein', 'breakfast', 'quick-meal'], ingredients: [{ name: 'Eggs', allergen: true }, { name: 'Onions', allergen: false }, { name: 'Tomatoes', allergen: false }, { name: 'Green Chilies', allergen: false }, { name: 'Cilantro', allergen: false }] },
  { name: 'Pesto Pasta', description: 'Penne pasta tossed in fresh basil pesto with cherry tomatoes', mealType: 'lunch', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 15, calories: 190, proteinG: 6, carbsG: 24, fatG: 8, fiberG: 1.5, sugarG: 2, sodiumMg: 350, aliases: ['pesto penne', 'basil pesto pasta'], tags: ['vegetarian', 'pasta', 'herb'], ingredients: [{ name: 'Penne Pasta', allergen: true }, { name: 'Basil Pesto', allergen: true }, { name: 'Pine Nuts', allergen: true }, { name: 'Parmesan', allergen: true }, { name: 'Cherry Tomatoes', allergen: false }] },
  { name: 'Quinoa Salad Bowl', description: 'Nutty quinoa with roasted vegetables and lemon vinaigrette', mealType: 'lunch', cuisine: 'Mediterranean', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 25, calories: 120, proteinG: 5, carbsG: 18, fatG: 3.5, fiberG: 3, sugarG: 2, sodiumMg: 180, aliases: ['quinoa bowl', 'quinoa salad', 'power bowl'], tags: ['vegan', 'high-fiber', 'gluten-free', 'superfood'], ingredients: [{ name: 'Quinoa', allergen: false }, { name: 'Sweet Potato', allergen: false }, { name: 'Chickpeas', allergen: false }, { name: 'Kale', allergen: false }, { name: 'Lemon Vinaigrette', allergen: false }] },
  { name: 'Chicken Quesadilla', description: 'Crispy tortilla with melted cheese and spiced chicken', mealType: 'snack', cuisine: 'Mexican', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 12, calories: 250, proteinG: 14, carbsG: 20, fatG: 13, fiberG: 1, sugarG: 1.5, sodiumMg: 480, aliases: ['quesadilla', 'chicken quesadilla', 'cheese quesadilla'], tags: ['high-protein', 'mexican', 'cheese', 'quick-meal'], ingredients: [{ name: 'Chicken', allergen: false }, { name: 'Flour Tortilla', allergen: true }, { name: 'Cheddar Cheese', allergen: true }, { name: 'Bell Peppers', allergen: false }, { name: 'Onions', allergen: false }] },
  { name: 'Masala Chai', description: 'Indian spiced tea with milk and cardamom', mealType: 'snack', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 10, calories: 45, proteinG: 1.5, carbsG: 5, fatG: 2, fiberG: 0, sugarG: 3, sodiumMg: 30, aliases: ['chai', 'masala tea', 'indian tea'], tags: ['beverage', 'comfort-drink'], ingredients: [{ name: 'Black Tea', allergen: false }, { name: 'Milk', allergen: true }, { name: 'Sugar', allergen: false }, { name: 'Cardamom', allergen: false }, { name: 'Ginger', allergen: false }] },
  { name: 'Banana Protein Shake', description: 'Banana whey protein shake with milk and peanut butter', mealType: 'snack', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 5, calories: 180, proteinG: 18, carbsG: 20, fatG: 4, fiberG: 1.5, sugarG: 14, sodiumMg: 120, aliases: ['protein shake', 'banana shake', 'protein smoothie'], tags: ['high-protein', 'post-workout', 'beverage'], ingredients: [{ name: 'Whey Protein', allergen: true }, { name: 'Banana', allergen: false }, { name: 'Milk', allergen: true }, { name: 'Peanut Butter', allergen: true }] },
  { name: 'Vegetable Soup', description: 'Hearty mixed vegetable soup with herbs and broth', mealType: 'snack', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 30, calories: 35, proteinG: 1.5, carbsG: 6, fatG: 0.5, fiberG: 1.5, sugarG: 2.5, sodiumMg: 280, aliases: ['veg soup', 'vegetable broth', 'mixed vegetable soup'], tags: ['vegan', 'low-calorie', 'soup', 'detox'], ingredients: [{ name: 'Mixed Vegetables', allergen: false }, { name: 'Vegetable Broth', allergen: false }, { name: 'Herbs', allergen: false }, { name: 'Garlic', allergen: false }, { name: 'Onion', allergen: false }] },
  { name: 'Grilled Fish Tacos', description: 'White fish with cabbage slaw and lime crema in corn tortillas', mealType: 'dinner', cuisine: 'Mexican', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 20, calories: 170, proteinG: 14, carbsG: 14, fatG: 6, fiberG: 2, sugarG: 1.5, sodiumMg: 350, aliases: ['fish tacos', 'baja tacos', 'grilled fish'], tags: ['high-protein', 'mexican', 'seafood'], ingredients: [{ name: 'White Fish', allergen: false }, { name: 'Corn Tortillas', allergen: false }, { name: 'Cabbage', allergen: false }, { name: 'Lime', allergen: false }, { name: 'Sour Cream', allergen: true }] },
  { name: 'Dal Tadka', description: 'Yellow lentils tempered with cumin, garlic and ghee', mealType: 'lunch', cuisine: 'Indian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 25, calories: 85, proteinG: 5, carbsG: 11, fatG: 3, fiberG: 3.5, sugarG: 1, sodiumMg: 300, aliases: ['yellow dal', 'toor dal', 'dal fry'], tags: ['vegetarian', 'high-fiber', 'comfort-food', 'indian-staple'], ingredients: [{ name: 'Toor Dal', allergen: false }, { name: 'Ghee', allergen: true }, { name: 'Cumin Seeds', allergen: false }, { name: 'Garlic', allergen: false }, { name: 'Tomatoes', allergen: false }] },
  { name: 'Chicken Stir Fry', description: 'Quick chicken and vegetable stir fry with soy-oyster sauce', mealType: 'dinner', cuisine: 'Chinese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 15, calories: 130, proteinG: 16, carbsG: 6, fatG: 5, fiberG: 1.5, sugarG: 3, sodiumMg: 450, aliases: ['chicken stirfry', 'stir fry chicken vegetables'], tags: ['high-protein', 'quick-meal', 'low-carb'], ingredients: [{ name: 'Chicken Breast', allergen: false }, { name: 'Broccoli', allergen: false }, { name: 'Bell Peppers', allergen: false }, { name: 'Soy Sauce', allergen: false }, { name: 'Garlic', allergen: false }] },
  { name: 'Mushroom Pizza', description: 'Wood-fired pizza topped with assorted mushrooms and mozzarella', mealType: 'dinner', cuisine: 'Italian', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 25, calories: 240, proteinG: 10, carbsG: 28, fatG: 10, fiberG: 2, sugarG: 3, sodiumMg: 520, aliases: ['fungi pizza', 'mushroom cheese pizza'], tags: ['vegetarian', 'mushroom', 'cheese'], ingredients: [{ name: 'Pizza Dough', allergen: true }, { name: 'Mixed Mushrooms', allergen: false }, { name: 'Mozzarella', allergen: true }, { name: 'Truffle Oil', allergen: false }, { name: 'Thyme', allergen: false }] },
  { name: 'Chia Pudding', description: 'Creamy chia seed pudding with coconut milk and berries', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 5, calories: 85, proteinG: 3, carbsG: 10, fatG: 4, fiberG: 5, sugarG: 4, sodiumMg: 40, aliases: ['chia seed pudding', 'overnight chia', 'chia coconut'], tags: ['vegan', 'high-fiber', 'omega-3', 'meal-prep'], ingredients: [{ name: 'Chia Seeds', allergen: false }, { name: 'Coconut Milk', allergen: false }, { name: 'Maple Syrup', allergen: false }, { name: 'Blueberries', allergen: false }, { name: 'Vanilla', allergen: false }] },
  { name: 'Prawn Tempura', description: 'Lightly battered and deep-fried prawns with dipping sauce', mealType: 'snack', cuisine: 'Japanese', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 15, calories: 210, proteinG: 10, carbsG: 16, fatG: 12, fiberG: 0.3, sugarG: 0.5, sodiumMg: 380, aliases: ['shrimp tempura', 'tempura prawns', 'ebi tempura'], tags: ['seafood', 'fried', 'japanese', 'appetizer'], ingredients: [{ name: 'Prawns', allergen: true }, { name: 'Tempura Batter', allergen: true }, { name: 'Panko', allergen: true }, { name: 'Dipping Sauce', allergen: false }, { name: 'Vegetable Oil', allergen: false }] },
  { name: 'Som Tam', description: 'Thai green papaya salad with peanuts and lime dressing', mealType: 'snack', cuisine: 'Thai', isVeg: true, isVegan: true, isEggetarian: false, prepTimeMin: 10, calories: 50, proteinG: 1.5, carbsG: 8, fatG: 1.5, fiberG: 2, sugarG: 5, sodiumMg: 350, aliases: ['papaya salad', 'thai green papaya', 'green papaya salad'], tags: ['vegan', 'low-calorie', 'thai', 'refreshing'], ingredients: [{ name: 'Green Papaya', allergen: false }, { name: 'Peanuts', allergen: true }, { name: 'Lime', allergen: false }, { name: 'Fish Sauce', allergen: false }, { name: 'Chili', allergen: false }] },
  { name: 'Lamb Kebab', description: 'Spiced ground lamb skewers grilled over charcoal', mealType: 'dinner', cuisine: 'Mediterranean', isVeg: false, isVegan: false, isEggetarian: false, prepTimeMin: 30, calories: 220, proteinG: 18, carbsG: 2, fatG: 15, fiberG: 0.3, sugarG: 0.5, sodiumMg: 320, aliases: ['lamb kebabs', 'seekh kebab', 'grilled lamb'], tags: ['high-protein', 'grilled', 'keto-friendly'], ingredients: [{ name: 'Ground Lamb', allergen: false }, { name: 'Onions', allergen: false }, { name: 'Cumin', allergen: false }, { name: 'Parsley', allergen: false }, { name: 'Sumac', allergen: false }] },
  { name: 'Muesli Bowl', description: 'Crunchy muesli with cold milk, banana and almonds', mealType: 'breakfast', cuisine: 'American', isVeg: true, isVegan: false, isEggetarian: true, prepTimeMin: 3, calories: 150, proteinG: 4, carbsG: 24, fatG: 4.5, fiberG: 3, sugarG: 10, sodiumMg: 80, aliases: ['muesli', 'granola bowl', 'cereal bowl'], tags: ['vegetarian', 'high-fiber', 'breakfast', 'quick-meal'], ingredients: [{ name: 'Muesli', allergen: true }, { name: 'Milk', allergen: true }, { name: 'Banana', allergen: false }, { name: 'Almonds', allergen: true }, { name: 'Honey', allergen: false }] },
];

async function seed() {
  console.log('🌱 Seeding NutriAI database...');

  // Clean existing data
  await prisma.foodLogItem.deleteMany();
  await prisma.foodLog.deleteMany();
  await prisma.mealPlanItem.deleteMany();
  await prisma.mealPlanDay.deleteMany();
  await prisma.dailyNutrition.deleteMany();
  await prisma.waterLog.deleteMany();
  await prisma.weightLog.deleteMany();
  await prisma.unknownFoodSubmission.deleteMany();
  await prisma.aiLog.deleteMany();
  await prisma.mealIngredient.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.mealAlias.deleteMany();
  await prisma.mealServing.deleteMany();
  await prisma.mealNutrition.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.userAllergy.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.userGoal.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleared existing data');

  // Seed meals
  for (const meal of MEALS) {
    const created = await prisma.meal.create({
      data: {
        name: meal.name,
        description: meal.description,
        mealType: meal.mealType,
        cuisine: meal.cuisine,
        isVeg: meal.isVeg,
        isVegan: meal.isVegan,
        isEggetarian: meal.isEggetarian,
        baseServingGms: 100,
        prepTimeMin: meal.prepTimeMin,
        isActive: true,
        source: 'admin',
        nutrition: {
          create: {
            calories: meal.calories,
            proteinG: meal.proteinG,
            carbsG: meal.carbsG,
            fatG: meal.fatG,
            fiberG: meal.fiberG,
            sugarG: meal.sugarG,
            sodiumMg: meal.sodiumMg,
            perServingGms: 100,
          },
        },
        servings: {
          create: [
            { servingName: 'Small (100g)', servingGms: 100, multiplier: 1.0 },
            { servingName: 'Medium (200g)', servingGms: 200, multiplier: 2.0 },
            { servingName: 'Large (300g)', servingGms: 300, multiplier: 3.0 },
          ],
        },
        aliases: {
          create: meal.aliases.map((a) => ({ aliasName: a })),
        },
        tags: {
          create: meal.tags.map((t) => ({ tagName: t })),
        },
        ingredients: {
          create: meal.ingredients.map((i) => ({
            ingredientName: i.name,
            containsAllergen: i.allergen,
          })),
        },
      },
    });
    console.log(`  ✅ ${created.name}`);
  }

  console.log(`\n🍽️  Seeded ${MEALS.length} meals`);

  // Seed test user
  const passwordHash = await bcrypt.hash('password123', 10);
  const testUser = await prisma.user.create({
    data: {
      email: 'test@nutriai.com',
      passwordHash,
      name: 'Test User',
      role: 'user',
      isActive: true,
      profile: {
        create: {
          firstName: 'Test',
          lastName: 'User',
          age: 28,
          gender: 'male',
          heightCm: 175,
          weightKg: 75,
          country: 'India',
          timezone: 'Asia/Kolkata',
        },
      },
      goal: {
        create: {
          goalType: 'lose_fat',
          activityLevel: 'moderately_active',
          workoutFrequency: '4_times_week',
          targetWeightKg: 70,
        },
      },
      preference: {
        create: {
          cuisinePreference: 'Indian',
          dietType: 'non-veg',
          budgetLevel: 'medium',
        },
      },
      allergies: {
        create: [{ allergyName: 'Peanuts' }],
      },
    },
  });

  // Create daily nutrition for today
  const today = new Date().toISOString().split('T')[0];
  // BMR for 28yo male, 175cm, 75kg = (10*75) + (6.25*175) - (5*28) + 5 = 750 + 1093.75 - 140 + 5 = 1708.75
  // TDEE = 1708.75 * 1.55 = 2648.56
  // Target = 2648.56 - 500 = 2148.56 ≈ 2149
  // lose_fat macros: 40% protein, 30% carbs, 30% fat
  // protein: (2149 * 0.40)/4 = 215g, carbs: (2149 * 0.30)/4 = 161g, fat: (2149 * 0.30)/9 = 72g
  await prisma.dailyNutrition.create({
    data: {
      userId: testUser.id,
      date: today,
      targetCalories: 2149,
      consumedCalories: 0,
      targetProtein: 215,
      consumedProtein: 0,
      targetCarbs: 161,
      consumedCarbs: 0,
      targetFat: 72,
      consumedFat: 0,
    },
  });

  // Demo user
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@nutriai.com',
      passwordHash,
      name: 'Demo User',
      role: 'user',
      isActive: true,
    },
  });

  console.log(`\n👤 Seeded 2 test users (test@nutriai.com / demo@nutriai.com)`);
  console.log('\n✅ Seed complete!');
}

export { seed };

if (require.main === module) {
  seed().catch(console.error);
}
