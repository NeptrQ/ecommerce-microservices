# Project Learnings

This project helped me learn how to run a small microservices application locally with Docker Compose and deploy it to Kubernetes with Minikube.

## 1. Microservices and the API gateway

Each service runs as its own Node.js process. The API gateway accepts client requests and forwards them to the appropriate service.

| Component | Container port | Purpose |
| --- | ---: | --- |
| API gateway | 5000 | Routes client requests to backend services |
| Auth service | 5001 | Verifies tokens and serves user profiles |
| Login service | 5002 | Authenticates users |
| Register service | 5003 | Creates user accounts |
| Order service | 5004 | Manages orders |
| Product service | 5005 | Manages products |
| MongoDB | 27017 locally | Database when using the Compose MongoDB container |

The gateway uses environment variables such as `AUTH_URL` and `PRODUCT_URL` to find backend services. The same application can therefore use localhost URLs for local development and Kubernetes Service DNS names when deployed in a cluster.

## 2. Environment configuration and secrets

- `process.env` reads environment variables in Node.js.
- `dotenv` loads a service's `.env` file when running it directly on a development machine.
- Docker Compose can read variables from the root `.env` file and pass them into containers.
- Kubernetes ConfigMaps provide non-sensitive settings, such as ports and backend URLs.
- Kubernetes Secrets provide sensitive settings, such as `MONGO_URI` and `JWT_SECRET`.
- Do not commit `.env` files or real Secret values. Keep `.env.example` files generic and replace example credentials locally.

The environment variable names must match the application. For example, the services read `MONGO_URI`; setting only `MONGO_URL` will not configure their MongoDB connection.

If a MongoDB URI has no database path, the driver may use its default database. Add a path such as `/ecommerce` when that is the intended database.

## Authentication and authorization

- Login issues a signed JWT containing the user's ID and role. Clients send it as `Authorization: Bearer <token>`.
- Public registration always creates a `customer`; it cannot grant an `admin` role. Assign admin roles only through a trusted database or seed process.
- Product reads are public. Creating, updating, and deleting products require an admin token.
- Orders require a valid token. Customers can see and cancel only their own orders; admins can view all orders, update order status, and cancel any order.
- The gateway checks tokens and roles, and the product/order services repeat the checks so direct service requests cannot bypass authorization.
- Public registration cannot create admins. To promote an account, set its `role` to `admin` in the trusted MongoDB `users` collection, then log in again to receive a token with the admin role. Existing tokens keep their original role until a new login.

## 3. Dockerfiles and ignore files

Each service has its own Dockerfile. A typical Node.js image:

1. Selects a Node.js base image.
2. Copies package manifests and runs `npm ci`.
3. Copies the application source.
4. Exposes the service's container port and starts `server.js`.

`.dockerignore` keeps files such as `node_modules` and `.env` out of the image build context. `.gitignore` keeps local dependencies, credentials, and machine-specific files out of Git.

## 4. Docker Compose networking

Compose starts the gateway, backend services, and MongoDB together. Services on the Compose network find each other by Compose service name, for example `http://auth-service:5001`; `localhost` inside a container refers to that container, not another service.

The gateway listens on container port `5000`. Compose maps it to host port `5011`, so the local gateway URL is `http://localhost:5011`.

Useful commands:

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl http://localhost:5011/health
docker compose logs --tail=50 api-gateway
```

## 5. Kubernetes resources

- A **Namespace** groups this application's cluster resources under `ecommerce`.
- A **Deployment** creates and maintains the requested number of Pods.
- A **Service** provides stable networking and DNS for Pods. For example, the gateway can call `http://auth-service:5001`.
- A **ConfigMap** becomes environment variables when a Deployment references it with `envFrom`.
- A **Secret** provides sensitive values to containers using `secretKeyRef`.
- An **Ingress** routes HTTP requests by hostname to a Kubernetes Service. It requires an Ingress controller, which is enabled as a Minikube addon here.

Kubernetes Service ports and container ports can differ. The gateway Service listens on port `5011` and forwards to the gateway container's port `5000`. The Ingress backend must reference the Service port, `5011`.

## 6. Building and loading images into Minikube

Minikube may use its own container image store. Building an image on the host does not always make it available to Kubernetes automatically. Build the images, tag the gateway with the name used by its Deployment, and load all images into Minikube:

```bash
docker compose build
docker tag ecommerce-microservices-api-gateway:latest toritoru/gateway:latest

minikube image load toritoru/gateway:latest \
  ecommerce-microservices-auth-service:latest \
  ecommerce-microservices-login-service:latest \
  ecommerce-microservices-register-service:latest \
  ecommerce-microservices-order-service:latest \
  ecommerce-microservices-product-service:latest
```

`imagePullPolicy: IfNotPresent` lets Kubernetes use an image already loaded into Minikube.

## 7. Deploying and checking the Kubernetes application

Apply the Namespace first, then the remaining manifests. The local Secret manifest is Git-ignored and must exist with valid values.

```bash
minikube start
minikube addons enable ingress

kubectl apply -f kubernetes/namespace.yaml
kubectl apply -R -f kubernetes
kubectl wait --for=condition=available deployment --all \
  -n ecommerce --timeout=180s
kubectl get pods,services,ingress -n ecommerce
```

Useful diagnostics:

```bash
kubectl describe pod <pod-name> -n ecommerce
kubectl logs deployment/<deployment-name> -n ecommerce
kubectl get events -n ecommerce --sort-by=.lastTimestamp
```

Health probes let Kubernetes check whether a service is ready and restart it if it becomes unhealthy. A brief `connection refused` during startup can be normal; check the final Pod readiness and Deployment rollout status.

## 8. Testing Ingress on macOS with Minikube

The Ingress rule uses the hostname `ecommerce.com`. For a local test, map that hostname to loopback in `/etc/hosts`:

```text
127.0.0.1 ecommerce.com
```

Then run this command in a terminal and keep it open:

```bash
kubectl port-forward -n ingress-nginx \
  svc/ingress-nginx-controller 8080:80
```

In another terminal, test the route:

```bash
curl -i http://ecommerce.com:8080/health
```

The `Host` header must match the hostname in the Ingress rule. On macOS with Minikube's Docker driver, the Minikube node IP may not be directly reachable from the host; port-forwarding provides a local route for testing.
