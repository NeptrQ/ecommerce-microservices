# Project Overview & Postman API Testing Guide

## What This Project Is About

This project is a **Node.js (Express) E-Commerce Microservices** backend connected to a cloud **MongoDB Atlas** database (via Mongoose). It can be run locally with **Docker Compose** ([docker-compose.yml](docker-compose.yml)) or deployed on **Kubernetes (Minikube)** using YAML manifests only ([kubernetes/](kubernetes/)), **NGINX Ingress Fanout DNS** ([kubernetes/nginx/ingress.yaml](kubernetes/nginx/ingress.yaml)), and **BusyBox sidecar logging** ([utils/logger.js](utils/logger.js)).

### Architecture & Microservices

| Service | Container Port | Access | Responsibility & MongoDB Collection | Source |
| --- | --- | --- | --- | --- |
| **API Gateway** | `5000` | Exposed (`5011` Compose / Ingress `ecommerce.com` → `5011`) | Single public entry point; validates JWTs/roles and routes requests via `axios` | [api-gateway/server.js](api-gateway/server.js) |
| **Auth Service** | `5001` | Internal only (`ClusterIP` / Docker network) | Verifies JWTs (`POST /auth/verify`) and reads user profiles (`users`) | [auth-service/server.js](auth-service/server.js) |
| **Login Service** | `5002` | Internal only (`ClusterIP` / Docker network) | Validates `bcryptjs` passwords against `users` and issues 24h JWTs | [login-service/server.js](login-service/server.js) |
| **Register Service** | `5003` | Internal only (`ClusterIP` / Docker network) | Hashes passwords and inserts new `customer` accounts into `users` | [register-service/server.js](register-service/server.js) |
| **Order Service** | `5004` | Internal only (`ClusterIP` / Docker network) | Manages `orders` (create, view own/all, admin status update, soft-cancel) | [order-service/server.js](order-service/server.js) |
| **Product Service** | `5005` | Internal only (`ClusterIP` / Docker network) | Full CRUD + bulk insert on `products` (public reads, admin-only writes) | [product-service/server.js](product-service/server.js) |

In Kubernetes ([kubernetes/deployments/](kubernetes/deployments)), each pod also mounts an `emptyDir` volume at `/shared-logs` shared between the Node.js application container and a `busybox:1.36` `log-reader` sidecar container.

---

## 1. Start the Application

### Option A: Kubernetes (Minikube — YAML-Only Deployment)

1. Start Minikube and enable Ingress:
   ```powershell
   minikube start
   minikube addons enable ingress
   ```
2. Build and load images into Minikube:
   ```powershell
   docker compose -p ecommerce-microservices build
   docker tag ecommerce-microservices-api-gateway:latest toritoru/gateway:latest

   minikube image load `
     toritoru/gateway:latest `
     ecommerce-microservices-auth-service:latest `
     ecommerce-microservices-login-service:latest `
     ecommerce-microservices-register-service:latest `
     ecommerce-microservices-order-service:latest `
     ecommerce-microservices-product-service:latest
   ```
3. Create `kubernetes/secret.yaml` (git-ignored) from [kubernetes/secret.yaml.example](kubernetes/secret.yaml.example) and fill in your cloud **MongoDB Atlas** `MONGO_URI` and `JWT_SECRET`:
   ```powershell
   Copy-Item kubernetes/secret.yaml.example kubernetes/secret.yaml
   ```
4. Deploy all YAML manifests:
   ```powershell
   kubectl apply -f kubernetes/namespace.yaml
   kubectl apply -R -f kubernetes
   kubectl wait --for=condition=available deployment --all -n ecommerce --timeout=180s
   kubectl get pods,services,ingress -n ecommerce
   ```
5. Map `127.0.0.1 ecommerce.com` in `C:\Windows\System32\drivers\etc\hosts` (or `/etc/hosts` on macOS/Linux) and run port-forwarding in a separate terminal:
   ```powershell
   kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
   ```

- **Gateway Base URL (Fanout DNS):** `http://ecommerce.com:8080`

### Option B: Docker Compose (Local Testing with Cloud MongoDB Atlas)

1. Create a `.env` file from [.env.example](.env.example) if you have not already:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Edit `.env` and set both `JWT_SECRET` and your cloud **MongoDB Atlas** `MONGO_URI` (`mongodb+srv://<username>:<password>@<cluster-host>/<database>`).
3. Build and start all containers:
   ```powershell
   docker compose up -d --build
   ```
4. Verify the gateway is up:
   ```powershell
   curl http://localhost:5011/health
   ```

- **Gateway Base URL:** `http://localhost:5011` *(all backend services are isolated on the internal Docker network and reachable only via the API Gateway)*

---

## 2. Configure a Postman Environment

Create a Postman Environment with the following variables:

| Variable | Value |
| --- | --- |
| `baseUrl` | `http://ecommerce.com:8080` (Minikube Fanout DNS) or `http://localhost:5011` (Docker Compose) |
| `customerToken` | *(populated after customer login)* |
| `adminToken` | *(populated after promoting a user to `admin` and logging in again)* |
| `productId` | *(populated after creating a product)* |
| `orderId` | *(populated after creating an order)* |

---

## 3. Postman API Test Walkthrough Across All Microservices

All client requests go strictly through the **API Gateway** (`{{baseUrl}}`).

### A. Gateway Health Check

- **API Gateway:** `GET {{baseUrl}}/health` → `200 OK`

### B. User Registration, Login & Auth (`register-service`, `login-service`, `auth-service`)

1. **Upload (Create) a Customer in MongoDB Atlas (`users`)**
   - **Method & URL:** `POST {{baseUrl}}/register`
   - **Body (JSON):**
     ```json
     {
       "name": "Alice",
       "email": "alice@example.com",
       "password": "Password123!"
     }
     ```
   - **Expected:** `201 Created`. Public registration always sets `role: "customer"`.

2. **Login & Retrieve Customer JWT**
   - **Method & URL:** `POST {{baseUrl}}/login`
   - **Body (JSON):**
     ```json
     {
       "email": "alice@example.com",
       "password": "Password123!"
     }
     ```
   - **Postman Post-response Script (optional):**
     ```javascript
     pm.environment.set("customerToken", pm.response.json().token);
     ```

3. **Verify JWT Token**
   - **Method & URL:** `POST {{baseUrl}}/auth/verify`
   - **Body (JSON):**
     ```json
     {
       "token": "{{customerToken}}"
     }
     ```
   - **Expected:** `200 OK` with `{ "valid": true, "user": { ... } }`.

4. **Retrieve Authenticated User Profile from MongoDB Atlas**
   - **Method & URL:** `GET {{baseUrl}}/auth/profile`
   - **Header:** `Authorization: Bearer {{customerToken}}`
   - **Expected:** `200 OK` with the user document (excluding `password`).

### C. Promote an Admin Account in MongoDB Atlas

Public `POST /register` cannot create admins. Creating, updating, and deleting products (`POST/PUT/DELETE /products`) and updating order status (`PUT /orders/:id`) require an `admin` JWT.

1. Register a second user (for example `admin@example.com`) via `POST {{baseUrl}}/register`.
2. In **MongoDB Atlas Data Explorer** or **MongoDB Compass**, locate that user in the `users` collection and update `role` from `"customer"` to `"admin"`.
3. Call `POST {{baseUrl}}/login` with `admin@example.com` and store the returned token in `{{adminToken}}` (existing tokens retain their previous role until a new login).

### D. Products — Upload, Retrieve, Update & Delete (`product-service` → `products`)

1. **Upload Single Product (Admin)**
   - **Method & URL:** `POST {{baseUrl}}/products`
   - **Header:** `Authorization: Bearer {{adminToken}}`
   - **Body (JSON):**
     ```json
     {
       "name": "Mechanical Keyboard",
       "description": "Wireless 75% keyboard",
       "price": 129.99,
       "quantity": 25,
       "category": "Electronics"
     }
     ```
   - **Postman Post-response Script (optional):**
     ```javascript
     pm.environment.set("productId", pm.response.json().product._id);
     ```

2. **Bulk Upload Multiple Products (Admin)**
   - **Method & URL:** `POST {{baseUrl}}/products`
   - **Header:** `Authorization: Bearer {{adminToken}}`
   - **Body (JSON)** *(supports either `{ "products": [...] }` or a raw JSON array `[...]`)*:
     ```json
     {
       "products": [
         {
           "name": "USB-C Hub",
           "price": 39.5,
           "quantity": 50,
           "category": "Accessories"
         },
         {
           "name": "27-inch Monitor",
           "price": 299.0,
           "quantity": 10,
           "category": "Electronics"
         }
       ]
     }
     ```

3. **Retrieve All Products (Public)**
   - **Method & URL:** `GET {{baseUrl}}/products`

4. **Retrieve Single Product (Public)**
   - **Method & URL:** `GET {{baseUrl}}/products/{{productId}}`

5. **Update Product (Admin)**
   - **Method & URL:** `PUT {{baseUrl}}/products/{{productId}}`
   - **Header:** `Authorization: Bearer {{adminToken}}`
   - **Body (JSON):**
     ```json
     {
       "price": 119.99,
       "quantity": 20
     }
     ```

6. **Delete Product from MongoDB Atlas (Admin)**
   - **Method & URL:** `DELETE {{baseUrl}}/products/{{productId}}`
   - **Header:** `Authorization: Bearer {{adminToken}}`
   - **Note:** Performs a **hard delete** (`Product.findByIdAndDelete`) in MongoDB. Run this after testing Orders if you want to reference `{{productId}}` when creating an order first.

### E. Orders — Upload, Retrieve, Update & Cancel (`order-service` → `orders`)

1. **Upload / Create Order (Customer or Admin)**
   - **Method & URL:** `POST {{baseUrl}}/orders`
   - **Header:** `Authorization: Bearer {{customerToken}}`
   - **Body (JSON):**
     ```json
     {
       "customerName": "Alice",
       "items": [
         {
           "productId": "{{productId}}",
           "productName": "Mechanical Keyboard",
           "quantity": 2,
           "price": 129.99
         }
       ]
     }
     ```
   - **Postman Post-response Script (optional):**
     ```javascript
     pm.environment.set("orderId", pm.response.json().order._id);
     ```
   - `userId` is populated from the JWT, and `totalPrice` is calculated server-side.

2. **Retrieve Orders**
   - **Customer's own orders:** `GET {{baseUrl}}/orders` or `GET {{baseUrl}}/orders/{{orderId}}` with `Authorization: Bearer {{customerToken}}`
   - **All users' orders (Admin):** `GET {{baseUrl}}/orders` with `Authorization: Bearer {{adminToken}}`

3. **Update Order Status (Admin Only)**
   - **Method & URL:** `PUT {{baseUrl}}/orders/{{orderId}}`
   - **Header:** `Authorization: Bearer {{adminToken}}`
   - **Body (JSON):**
     ```json
     {
       "status": "shipped"
     }
     ```
   - Allowed values: `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`.

4. **Cancel / Soft-Delete Order**
   - **Method & URL:** `DELETE {{baseUrl}}/orders/{{orderId}}`
   - **Header:** `Authorization: Bearer {{customerToken}}` (for own order) or `{{adminToken}}` (any order).
   - **Note:** Performs a **soft delete** by updating `status` to `"cancelled"` in MongoDB rather than deleting the document.

---

## 4. Verify Shared Kubernetes Volume (Multi-Container Access)

After running requests through Postman against Minikube, verify that the `/shared-logs` `emptyDir` volume is written by the service container and readable by the `log-reader` sidecar container:

```powershell
# Read from the main application container
kubectl exec deployment/product-service -n ecommerce -c product-service -- cat /shared-logs/product-service.log

# Read the same file from the BusyBox log-reader sidecar container
kubectl logs deployment/product-service -n ecommerce -c log-reader
```

---

## 5. Summary of MongoDB Data Operations

| Collection | Upload (Create) | Retrieve (Read) | Update | Delete |
| --- | --- | --- | --- | --- |
| `users` | `POST /register` | `GET /auth/profile` | Direct in MongoDB Atlas (e.g., promote `admin`) | No API endpoint; delete directly in MongoDB Atlas / Compass |
| `products` | `POST /products` (single or bulk, admin) | `GET /products`, `GET /products/:id` | `PUT /products/:id` (admin) | `DELETE /products/:id` (**hard delete**, admin) |
| `orders` | `POST /orders` (authenticated) | `GET /orders`, `GET /orders/:id` | `PUT /orders/:id` (admin status update) | `DELETE /orders/:id` (**soft-cancel** to `status: "cancelled"`) |
