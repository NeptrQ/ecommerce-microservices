# E-Commerce Microservices — Report Sections

Sections 5–9 of the CLD 376 Final Project template, plus a dedicated API Gateway section.

---

## 5. Microservice Details

### 5.1 Name and Running Port Number

| # | Microservice | Container Port | Kubernetes Service (ClusterIP) | Database Collection |
|---|---|---|---|---|
| 1 | API Gateway | 5000 | `gateway-service:5011 → 5000` | — |
| 2 | Auth Service | 5001 | `auth-service:5001` | `users` (read) |
| 3 | Login Service | 5002 | `login-service:5002` | `users` (read) |
| 4 | Register Service | 5003 | `register-service:5003` | `users` (write) |
| 5 | Order Service | 5004 | `order-service:5004` | `orders` |
| 6 | Product Service | 5005 | `product-service:5005` | `products` |

All services are Node.js 20 / Express applications. They connect to a cloud **MongoDB Atlas** cluster. Every service also exposes `GET /health`.

### 5.2 API Details for Each Microservice

All requests from outside the cluster go through the API Gateway: `http://ecommerce.com/...` on Kubernetes, or `http://localhost:5011/...` with Docker Compose.

**Auth levels:** *Public* = no token. *User* = `Authorization: Bearer <JWT>`, with role `customer` or `admin`. *Admin* = a JWT with role `admin`.

#### Register Service (port 5003)

| Method | Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| POST | `/register` | Public | `{ "name", "email", "password" }` | `201` `{ message, user: { id, name, email, role } }` |
| GET | `/health` | Public | — | `{ service: "Register Service", status: "UP" }` |

Passwords are hashed with bcrypt before they are stored. A duplicate email returns `409`.

#### Login Service (port 5002)

| Method | Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| POST | `/login` | Public | `{ "email", "password" }` | `200` `{ message, token, user }` |
| GET | `/health` | Public | — | `{ service: "Login Service", status: "UP" }` |

The returned JWT is valid for 24 hours. It carries `id`, `name`, `email` and `role`. An unknown email returns `404`, and a wrong password returns `401`.

#### Auth Service (port 5001)

| Method | Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| POST | `/auth/verify` | Public | `{ "token" }` | `{ valid: true, user: <decoded claims> }` |
| GET | `/auth/profile` | User | — | `{ user }` (password excluded) |
| GET | `/health` | Public | — | `{ service: "Auth Service", status: "UP" }` |

#### Product Service (port 5005)

| Method | Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| GET | `/products` | Public | — | `{ count, products: [...] }` |
| GET | `/products/:id` | Public | — | product object |
| POST | `/products` | Admin | `{ name, description?, price, quantity, category? }` or an array / `{ products: [...] }` for bulk insert | `201` `{ message, product(s) }` |
| PUT | `/products/:id` | Admin | any product fields | `{ message, product }` |
| DELETE | `/products/:id` | Admin | — | `{ message, product }` |
| GET | `/health` | Public | — | `{ service: "Product Service", status: "UP" }` |

Product schema: `name` (required), `description`, `price` (≥ 0), `quantity` (≥ 0), `category` (default `General`), plus timestamps.

#### Order Service (port 5004)

| Method | Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| GET | `/orders` | User | — | `{ count, orders }`. Customers see only their own orders; admins see all. |
| GET | `/orders/:id` | User | — | order object (customers only their own) |
| POST | `/orders` | User | `{ customerName?, items: [{ productId, productName, quantity, price }] }` | `201` `{ message, order }` |
| PUT | `/orders/:id` | Admin | `{ status }` | `{ message, order }` |
| DELETE | `/orders/:id` | User | — | `{ message, order }`. This cancels the order (sets `status: "cancelled"`) rather than deleting it. |
| GET | `/health` | Public | — | `{ service: "Order Service", status: "UP" }` |

`totalPrice` is calculated on the server as the sum of `price × quantity`. Status values are `pending`, `confirmed`, `shipped`, `delivered` and `cancelled`.

---

## 6. POD and Container Details

All resources run in the `ecommerce` namespace. Each Pod has two containers. One is the application container. The other is a BusyBox **sidecar** that reads the application's log file from a shared volume.

| Deployment | Replicas | Pod Label | Container 1 (app) | Image | Port | Container 2 (sidecar) |
|---|---|---|---|---|---|---|
| `gateway` | **2** | `app: gateway` | `gateway` | `toritoru/gateway:latest` | 5000 | `log-reader` (`busybox:1.36`) |
| `auth-service` | 1 | `app: auth-service` | `auth-service` | `ecommerce-microservices-auth-service:latest` | 5001 | `log-reader` (`busybox:1.36`) |
| `login-service` | 1 | `app: login-service` | `login-service` | `ecommerce-microservices-login-service:latest` | 5002 | `log-reader` (`busybox:1.36`) |
| `register-service` | 1 | `app: register-service` | `register-service` | `ecommerce-microservices-register-service:latest` | 5003 | `log-reader` (`busybox:1.36`) |
| `order-service` | 1 | `app: order-service` | `order-service` | `ecommerce-microservices-order-service:latest` | 5004 | `log-reader` (`busybox:1.36`) |
| `product-service` | 1 | `app: product-service` | `product-service` | `ecommerce-microservices-product-service:latest` | 5005 | `log-reader` (`busybox:1.36`) |

**Totals:** 6 Deployments, 7 Pods (the gateway has 2 replicas), and 14 containers.

**Container details:**
- **Application images** are built from `node:20-alpine`. They install production dependencies only (`npm ci --omit=dev`) and run as the non-root `node` user.
- **Configuration:** non-secret settings come from the `ecommerce-config` ConfigMap (`PORT`, `LOG_DIR`, and the service URLs) or from inline `env`. Secrets (`MONGO_URI`, `JWT_SECRET`) come from the `ecommerce-secret` Secret through `secretKeyRef`.
- **Health checks:** the five backend services define `readinessProbe` and `livenessProbe` checks as `HTTP GET /health` on the `http` port.
- **Image pull policy:** `IfNotPresent`. Images are built locally and loaded into Minikube with `minikube image load`.

Useful commands:
```bash
kubectl get pods -n ecommerce -o wide
kubectl describe pod <pod-name> -n ecommerce
kubectl get pod <pod-name> -n ecommerce -o jsonpath='{.spec.containers[*].name}'
```

---

## 7. Kubernetes YAML Files

### 7.1 Deployment YAML File

**API Gateway** (`kubernetes/deployments/gateway-deployment.yaml`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  namespace: ecommerce
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
        # Main Gateway application
        - name: gateway
          image: toritoru/gateway:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5000
              name: http
          envFrom:
            - configMapRef:
                name: ecommerce-config
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ecommerce-secret
                  key: JWT_SECRET
          volumeMounts:
            - name: shared-volume
              mountPath: /shared-logs
        # Sidecar container: reads Gateway logs
        - name: log-reader
          image: busybox:1.36
          imagePullPolicy: IfNotPresent
          command:
            - sh
            - -c
            - |
              while [ ! -f /shared-logs/gateway.log ]; do
                sleep 1
              done
              tail -F /shared-logs/gateway.log
          volumeMounts:
            - name: shared-volume
              mountPath: /shared-logs
              readOnly: true
      volumes:
        - name: shared-volume
          emptyDir: {}
```

**Backend microservice example: Auth Service** (`kubernetes/deployments/auth-deployment.yaml`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: ecommerce
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: auth-service
          image: ecommerce-microservices-auth-service:latest
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 5001
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "5001"
            - name: LOG_DIR
              value: /shared-logs
            - name: MONGO_URI
              valueFrom:
                secretKeyRef:
                  name: ecommerce-secret
                  key: MONGO_URI
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ecommerce-secret
                  key: JWT_SECRET
          volumeMounts:
            - name: shared-logs
              mountPath: /shared-logs
          readinessProbe:
            httpGet:
              path: /health
              port: http
          livenessProbe:
            httpGet:
              path: /health
              port: http
        - name: log-reader
          image: busybox:1.36
          imagePullPolicy: IfNotPresent
          command:
            - sh
            - -c
            - |
              while [ ! -f /shared-logs/auth-service.log ]; do
                sleep 1
              done
              tail -F /shared-logs/auth-service.log
          volumeMounts:
            - name: shared-logs
              mountPath: /shared-logs
              readOnly: true
      volumes:
        - name: shared-logs
          emptyDir: {}
```

The `login`, `register`, `order` and `product` Deployments follow the same structure. Only the name, label, image, port and log file name change. The Register Service does not receive `JWT_SECRET` because it never signs or verifies tokens.

Apply all the manifests:
```bash
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/configmap.yaml -f kubernetes/secret.yaml
kubectl apply -f kubernetes/deployments/
```

### 7.2 Service YAML File

Every Service is of type **ClusterIP**, so none of them is reachable from outside the cluster directly. External traffic enters only through the Ingress.

**Gateway Service** (`kubernetes/services/gateway-service.yaml`). It exposes port 5011 and forwards to container port 5000:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gateway-service
  namespace: ecommerce
spec:
  type: ClusterIP
  selector:
    app: gateway
  ports:
    - name: http
      port: 5011
      targetPort: 5000
      protocol: TCP
```

**Backend Service example: Auth Service** (`kubernetes/services/auth-service.yaml`):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: ecommerce
spec:
  type: ClusterIP
  selector:
    app: auth-service
  ports:
    - name: http
      port: 5001
      targetPort: http
      protocol: TCP
```

| Service | Type | Port → targetPort | Selector |
|---|---|---|---|
| `gateway-service` | ClusterIP | 5011 → 5000 | `app: gateway` |
| `auth-service` | ClusterIP | 5001 → http (5001) | `app: auth-service` |
| `login-service` | ClusterIP | 5002 → http (5002) | `app: login-service` |
| `register-service` | ClusterIP | 5003 → http (5003) | `app: register-service` |
| `order-service` | ClusterIP | 5004 → http (5004) | `app: order-service` |
| `product-service` | ClusterIP | 5005 → http (5005) | `app: product-service` |

Inside the cluster, services find each other through Kubernetes DNS, for example `http://order-service:5004`. These URLs are stored in the `ecommerce-config` ConfigMap and read by the gateway.

```bash
kubectl apply -f kubernetes/services/
kubectl get svc -n ecommerce
```

---

## 8. Fanout Mechanism

The project uses a **fanout** pattern: one entry point (one host name) routes requests to many backend services based on the URL path. Routing happens in two layers.

**Layer 1: NGINX Ingress (path-based fanout).** `kubernetes/nginx/ingress.yaml` defines a single host, `ecommerce.com`, with path rules for `/health`, `/register`, `/login`, `/auth`, `/products`, `/orders` and `/`. All the rules point to `gateway-service:5011`. The NGINX Ingress Controller is the only external entry point, and it load-balances across the 2 gateway replicas.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-ingress
  namespace: ecommerce
spec:
  ingressClassName: nginx
  rules:
    - host: ecommerce.com
      http:
        paths:
          - path: /register
            pathType: Prefix
            backend:
              service:
                name: gateway-service
                port:
                  number: 5011
          # ... same for /health, /login, /auth, /products, /orders, /
```

**Layer 2: API Gateway (service fanout).** The gateway checks the path and fans the request out to the correct microservice:

```
Client ──► ecommerce.com (NGINX Ingress) ──► gateway-service:5011 ──► Gateway Pod :5000
                                                                       │
             /register  ───────────────────────────────────────────────┼──► register-service:5003
             /login     ───────────────────────────────────────────────┼──► login-service:5002
             /auth/*    ───────────────────────────────────────────────┼──► auth-service:5001
             /products* ───────────────────────────────────────────────┼──► product-service:5005
             /orders*   ───────────────────────────────────────────────┴──► order-service:5004
```

The Ingress sends everything to the gateway, rather than routing each path straight to a service, so that JWT validation and admin-role checks happen in one place before a request reaches any backend.

**DNS setup (Minikube):**
```bash
minikube addons enable ingress
kubectl apply -f kubernetes/nginx/ingress.yaml
echo "$(minikube ip) ecommerce.com" | sudo tee -a /etc/hosts
curl http://ecommerce.com/health
```
(With the Docker driver on macOS, run `minikube tunnel` and map `ecommerce.com` to `127.0.0.1` instead.)

---

## 9. Volume Implementation

Each Pod uses an **`emptyDir` volume** to share log files between the application container and the BusyBox sidecar. This is the Kubernetes **sidecar logging pattern**.

**How it works:**
1. The Pod declares a volume `emptyDir: {}`. Kubernetes creates an empty directory when the Pod is scheduled onto a node, and deletes it when the Pod is removed.
2. The **application container** mounts the volume read-write at `/shared-logs`. Its `LOG_DIR=/shared-logs` setting tells the shared logger (`utils/logger.js`) to append one line per request to `/shared-logs/<service>.log`:
   ```
   2026-11-25T06:41:12.345Z gateway POST /login 200 87ms
   ```
3. The **`log-reader` sidecar** (`busybox:1.36`) mounts the same volume **read-only**. It waits until the log file exists, then runs `tail -F` on it, which streams every new line to its own stdout.
4. Kubernetes collects the sidecar's stdout, so the logs can be viewed with:
   ```bash
   kubectl logs -n ecommerce deploy/gateway -c log-reader -f
   kubectl logs -n ecommerce deploy/order-service -c log-reader -f
   ```

**Volume definition (from each Deployment):**
```yaml
      containers:
        - name: order-service
          volumeMounts:
            - name: shared-logs
              mountPath: /shared-logs        # read-write: app writes logs
        - name: log-reader
          volumeMounts:
            - name: shared-logs
              mountPath: /shared-logs
              readOnly: true                 # sidecar can only read
      volumes:
        - name: shared-logs
          emptyDir: {}
```

**Why `emptyDir`:** the logs only need to be shared between containers in the same Pod, and only for as long as the Pod runs. No PersistentVolume is needed, because the application data lives in MongoDB Atlas and not inside the cluster. The trade-off is that log files are lost when a Pod is deleted or rescheduled.

---

## API Gateway

**Role:** the API Gateway (`api-gateway/server.js`) is the single entry point to the system. It handles request routing, authentication and authorization, so the backend services are never exposed directly.

| Property | Value |
|---|---|
| Container port | 5000 |
| Kubernetes Service | `gateway-service` (ClusterIP, 5011 → 5000) |
| Replicas | 2 (load-balanced by the Service and the Ingress) |
| Docker Compose host port | `localhost:5011` |
| Image | `toritoru/gateway:latest` |
| Libraries | Express, Axios (forwarding), jsonwebtoken (JWT), CORS |

**Responsibilities:**
1. **Routing / proxying.** A `forward(targetUrl)` helper re-sends the request to the target service. It keeps the same method, path, body and `Authorization` header, and passes the backend's status code and JSON response back to the client.
2. **Authentication (`authenticate`).** It requires an `Authorization: Bearer <token>` header, verifies the JWT with `JWT_SECRET`, and checks that the token has a string `id` and a role of `customer` or `admin`. Otherwise it returns `401`.
3. **Authorization (`requireAdmin`).** Admin-only routes return `403` for any role other than `admin`.
4. **Logging.** Each request is written to `/shared-logs/gateway.log` for the sidecar to read.
5. **Health check.** `GET /health` returns `{ service: "API Gateway", status: "UP", port }`.

**Route table:**

| Method | Gateway Route | Gateway Check | Forwarded To |
|---|---|---|---|
| ANY | `/register` | — | Register Service :5003 |
| ANY | `/login` | — | Login Service :5002 |
| ANY | `/auth/verify` | — | Auth Service :5001 |
| ANY | `/auth/profile` | User JWT | Auth Service :5001 |
| GET | `/products`, `/products/:id` | — | Product Service :5005 |
| POST | `/products` | Admin | Product Service :5005 |
| PUT / DELETE | `/products/:id` | Admin | Product Service :5005 |
| GET / POST | `/orders` | User JWT | Order Service :5004 |
| GET / DELETE | `/orders/:id` | User JWT | Order Service :5004 |
| PUT | `/orders/:id` | Admin | Order Service :5004 |
| GET | `/health` | — | Answered by the gateway |

**Service discovery.** The backend URLs come from environment variables (`AUTH_URL`, `LOGIN_URL`, `REGISTER_URL`, `ORDER_URL`, `PRODUCT_URL`). On Kubernetes these are loaded from the ConfigMap and point at Kubernetes DNS names such as `http://order-service:5004`. In Docker Compose they point at the Compose service names on the internal network.

**Defense in depth.** The Order and Product services verify the JWT and the role again on their own, so they stay protected even if something bypasses the gateway.

**Example flow (placing an order):**
```
1. POST /login        → gateway → login-service   → returns JWT
2. POST /orders       → gateway checks JWT → order-service (re-checks JWT) → MongoDB → 201 Created
   Authorization: Bearer <JWT>
```
