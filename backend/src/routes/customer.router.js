import { Router } from "express";
import * as a from "../controllers/account.controller.js";import * as c from "../controllers/cart.controller.js";import * as o from "../controllers/order.controller.js";
import { allowRoles, verifyJWT } from "../middlewares/auth.middleware.js";
const r=Router();r.use(verifyJWT);
r.get("/addresses/",a.addresses);r.post("/addresses/",a.createAddress);r.patch("/addresses/:id/",a.updateAddress);r.delete("/addresses/:id/",a.deleteAddress);
r.get("/cart/",allowRoles("customer"),c.getCart);r.delete("/cart/",allowRoles("customer"),c.clearCart);r.post("/cart/items/",allowRoles("customer"),c.addItem);r.patch("/cart/items/:id/",allowRoles("customer"),c.updateItem);r.delete("/cart/items/:id/",allowRoles("customer"),c.removeItem);r.post("/cart/items/:id/resync-price/",allowRoles("customer"),c.resyncPrice);
r.get("/wishlist/",allowRoles("customer"),c.wishlist);r.post("/wishlist/toggle/",allowRoles("customer"),c.toggleWishlist);r.delete("/wishlist/:id/",allowRoles("customer"),c.removeWishlist);r.post("/wishlist/:id/move-to-cart/",allowRoles("customer"),c.moveWishlist);
r.post("/checkout/",allowRoles("customer"),o.checkout);r.get("/orders/",allowRoles("customer"),o.orders);r.get("/orders/:number/",allowRoles("customer"),o.order);r.post("/orders/:number/cancel/",allowRoles("customer"),o.cancelOrder);
export default r;
