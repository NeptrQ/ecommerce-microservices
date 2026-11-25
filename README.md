# E-Commerce Microservices

A Node.js microservices e-commerce API with an API Gateway, BusyBox sidecar logging, and MongoDB, runnable locally with **Docker Compose** or on **Kubernetes (Minikube)**.

---

## How the Flow Works

Based on the architecture flowchart:

1. **Incoming Traffic Flow**
   - **Client (Browser / Postman)** sends an HTTP request to the Ingress host (`zapp.com` in the flowchart; `ecommerce.com` in `kubernetes/nginx/ingress.yaml`).
   - **NGINX Ingress Controller** routes traffic to **Gateway Service** on port `5011`, which forwards it to the **API Gateway** pod on port `5000`.
   - **API Gateway** validates JWTs for protected routes and forwards requests to the microservices:
     - `/login` → **Login Service** (`:5002`)
     - `/register` → **Register Service** (`:5003`)
     - `/auth/*` → **Auth Service** (`:5001`)
     - `/orders/*` → **Order Service** (`:5004`)
     - `/products/*` → **Product Service** (`:5005`)

2. **Sidecar Logging Flow (per Pod)**
   - Each Pod shares an `emptyDir` volume mounted at `/shared-logs`.
   - The main Node.js container writes request logs to `/shared-logs/<service>.log`.
   - A **BusyBox (`log-reader`) sidecar** tails that file so logs can be inspected via Kubernetes.

3. **Database Flow (MongoDB Atlas)**
   - **Login** (`:5002`) → validates user passwords
   - **Register** (`:5003`) → inserts new users
   - **Auth** (`:5001`) → reads and verifies users
   - **Order** (`:5004`) → CRUD operations on orders
   - **Product** (`:5005`) → CRUD operations on products

---

## Option 1: Quick Setup (Docker Compose)

> **Prerequisites:** Docker Desktop (or Docker Engine + Compose) and a cloud **MongoDB Atlas** cluster.

1. **Create `.env` from the example file:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in:
   - `JWT_SECRET` — a long random secret for signing JWTs.
   - `MONGO_URI` — your cloud MongoDB Atlas connection string (`mongodb+srv://<user>:<password>@<cluster>/<database>`).

2. **Build and start all services:**
   ```bash
   docker compose up -d --build
   ```
   Only the **API Gateway** is exposed on the host (`http://localhost:5011`); individual microservices are reachable only on the internal Docker network.

3. **Verify:**
   ```bash
   curl http://localhost:5011/health
   ```

---

## Option 2: Kubernetes Setup (Minikube)

> **Prerequisites:** `docker`, `minikube`, and `kubectl`.

### 1. Start Minikube and enable Ingress
```bash
minikube start
minikube addons enable ingress
```

### 2. Build and load images into Minikube
Use `-p ecommerce-microservices` so image names match the Kubernetes Deployment manifests, and tag the gateway image as `toritoru/gateway:latest`:

```bash
docker compose -p ecommerce-microservices build
docker tag ecommerce-microservices-api-gateway:latest toritoru/gateway:latest

minikube image load \
  toritoru/gateway:latest \
  ecommerce-microservices-auth-service:latest \
  ecommerce-microservices-login-service:latest \
  ecommerce-microservices-register-service:latest \
  ecommerce-microservices-order-service:latest \
  ecommerce-microservices-product-service:latest
```

### 3. Prepare the Secret YAML (YAML-only deployment)
Copy the example Secret manifest to `kubernetes/secret.yaml` (git-ignored) and replace the placeholder `MONGO_URI` (MongoDB Atlas) and `JWT_SECRET`:

```bash
cp kubernetes/secret.yaml.example kubernetes/secret.yaml
```

### 4. Deploy all Kubernetes manifests
```bash
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -R -f kubernetes
kubectl wait --for=condition=available deployment --all -n ecommerce --timeout=180s
kubectl get pods,services,ingress -n ecommerce
```

### 5. Expose Fanout DNS Ingress locally and verify shared Volumes
`kubernetes/nginx/ingress.yaml` configures Fanout DNS for `ecommerce.com` (`/health`, `/register`, `/login`, `/auth`, `/products`, `/orders`, `/`), routing all traffic through `gateway-service:5011` (all backend microservice Services are `ClusterIP` with no direct client access).

1. Add this line to your hosts file (`/etc/hosts` on macOS/Linux, or `C:\Windows\System32\drivers\etc\hosts` on Windows):
   ```text
   127.0.0.1 ecommerce.com
   ```

2. In one terminal, forward traffic to the NGINX Ingress Controller:
   ```bash
   kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
   ```

3. In another terminal, test the gateway and verify that both containers in a Pod access the shared `/shared-logs` volume:
   ```bash
   curl http://ecommerce.com:8080/health
   curl http://ecommerce.com:8080/products

   # Read from the main application container
   kubectl exec deployment/product-service -n ecommerce -c product-service -- cat /shared-logs/product-service.log

   # Read the same file from the BusyBox log-reader sidecar container
   kubectl logs deployment/product-service -n ecommerce -c log-reader
   ```

---

## Main Endpoints (via Gateway)

| Endpoint | Service | Auth |
| --- | --- | --- |
| `GET /health` | API Gateway | Public |
| `POST /register` | Register Service | Public |
| `POST /login` | Login Service | Public |
| `POST /auth/verify` | Auth Service | Public |
| `GET /auth/profile` | Auth Service | Bearer Token |
| `GET /products`, `GET /products/:id` | Product Service | Public |
| `POST/PUT/DELETE /products` | Product Service | Admin Token |
| `GET/POST/DELETE /orders` | Order Service | Bearer Token |
| `PUT /orders/:id` | Order Service | Admin Token |
