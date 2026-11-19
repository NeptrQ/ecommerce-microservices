# Final Project Documentation Helper

Use these sections to paste directly into your Word Document (`Final Project Document Template-1-2.docx`):

---

## 1. Introduction
The E-Commerce Microservices Platform is a scalable, cloud-native application designed to handle end-to-end shopping operations, including user registration, secure authentication, product catalog management, and order processing. Built using modern cloud-native architectural principles, each functional domain is encapsulated into an independent microservice containerized with Docker and orchestrated inside a Kubernetes cluster. All incoming client traffic is routed through a centralized API Gateway and exposed to the public via an NGINX Ingress Controller using Fanout DNS routing. Application state is persisted securely in MongoDB Atlas cloud database.

---

## 2. Objective
- Implement a decoupled microservice architecture for an e-commerce platform.
- Containerize all services using lightweight, reproducible Docker images.
- Deploy and orchestrate multi-container pods on a Kubernetes (Minikube) cluster using declarative YAML configurations.
- Route all external client requests securely through an API Gateway entrypoint with zero direct access to backend microservices.
- Configure Fanout DNS with an NGINX Ingress Controller under a single custom domain (`aupp.com`).
- Demonstrate shared data storage between containers using Kubernetes Volumes (`emptyDir`) for unified application logging.
- Integrate a reliable cloud database (MongoDB Atlas) for persistence without relying on containerized database instances.

---

## 3. Architecture Diagram
*(Screenshot the open browser window from `architecture_diagram.html` and paste here)*

---

## 4. Technologies / Tools
- **Operating System / Container Runtime**: Windows 11, Docker Desktop, WSL2, containerd
- **Container Orchestration**: Kubernetes (Minikube v1.39.0)
- **Ingress & Networking**: NGINX Ingress Controller, Fanout DNS (`aupp.com`), Kubernetes Services (NodePort & ClusterIP)
- **Backend Framework**: Node.js (v24), Express.js (v4.19)
- **Authentication**: JSON Web Tokens (JWT), bcryptjs password hashing
- **Database**: Cloud Database — MongoDB Atlas (Mongoose ODM)
- **Storage / Persistence**: Kubernetes Shared Volume (`emptyDir`) for cross-container log aggregation
- **API Testing & Documentation**: Postman, REST Client
- **Version Control**: Git, GitHub

---

## 5. Microservice Details

### 5.1 Service Names & Ports
| # | Microservice Name | Port | Description |
|---|---|---|---|
| 1 | `api-gateway` | `5000` | Single entry point, reverse proxy & request routing |
| 2 | `auth-service` | `5001` | JWT token verification & authenticated profile retrieval |
| 3 | `login-service` | `5002` | User credential validation & JWT issuance |
| 4 | `register-service` | `5003` | User account creation with salted bcrypt password hashing |
| 5 | `order-service` | `5004` | Order placement, order status updates & cancellations |
| 6 | `product-service` | `5005` | Product catalog CRUD (Create, Read, Update, Delete) |

### 5.2 API Details for Each Microservice (Through API Gateway)
- **`POST /register`**:
  - Request Body: `{ "name", "email", "password", "role" }`
  - Response: `201 Created` with newly created user object.
- **`POST /login`**:
  - Request Body: `{ "email", "password" }`
  - Response: `200 OK` with JWT token and user metadata.
- **`POST /auth/verify`**:
  - Request Body: `{ "token" }`
  - Response: `200 OK` with `{ valid: true, user: {...} }`.
- **`GET /auth/profile`**:
  - Header: `Authorization: Bearer <token>`
  - Response: `200 OK` with user profile without password.
- **`GET /products`**:
  - Response: `200 OK` with array of products and count.
- **`POST /products`**:
  - Request Body: `{ "name", "description", "price", "quantity", "category" }`
  - Response: `201 Created` with created product.
- **`PUT /products/:id`**:
  - Request Body: Updated fields
  - Response: `200 OK` with updated product.
- **`DELETE /products/:id`**:
  - Response: `200 OK` with confirmation message.
- **`GET /orders`**:
  - Response: `200 OK` with order history.
- **`POST /orders`**:
  - Request Body: `{ "userId", "customerName", "items": [...] }`
  - Response: `201 Created` with calculated total price and order status `pending`.
- **`PUT /orders/:id`**:
  - Request Body: `{ "status": "shipped" }`
  - Response: `200 OK` with updated order status.

---

## 6. POD and Container Details
The system is organized into **2 multi-container Pods** to optimize communication and resource sharing:

### Pod 1: Gateway & Authentication Pod
- **Containers**:
  1. `api-gateway` (Port `5000`)
  2. `register-service` (Port `5003`)
  3. `login-service` (Port `5002`)
  4. `auth-service` (Port `5001`)
- **Networking**: Containers communicate locally over `localhost` with zero network overhead.

### Pod 2: Business Logic Pod
- **Containers**:
  1. `product-service` (Port `5005`)
  2. `order-service` (Port `5004`)
- **Networking**: Inter-pod communication is routed through Kubernetes Services (`order-service` and `product-service` ClusterIPs).

### Shared Volume Configuration
- Volume Name: `shared-app-logs`
- Type: `emptyDir: {}`
- Mounted at: `/var/log/ecommerce` across containers to collect unified application logs.
