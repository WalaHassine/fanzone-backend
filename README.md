# ⚽ FanZone Backend

REST API for **World Cup FanZone AI**, a platform that helps football fans find the best place to watch World Cup matches. It handles authentication, matches, fan zones, anonymous check-ins, alerts, and the AI-powered fan zone recommendation.



---

## Features

-  Registration and login with JWT + bcrypt
-  User preferences: favorite teams, city, atmosphere (calm, family-friendly, crowded, supporter)
-  World Cup matches, filterable by team
-  Fan zones (cafes, restaurants, public viewing places) with coordinates, capacity, and available seats
-  Anonymous check-ins with aggregated fan counts per team
-  In-app alerts for favorite team matches and fan zone availability
-  AI recommendation of the best fan zone, with an explanation
-  Admin endpoints to manage matches and fan zones and view check-in statistics

---

##  Tech Stack

| Layer          | Technology                       |
|----------------|----------------------------------|
| Framework      | NestJS (TypeScript)              |
| Database       | PostgreSQL                       |
| ORM            | `<TypeORM / Prisma>`             |
| Auth           | JWT + bcrypt                     |
| AI             | `<OpenAI API / local AI service>`|
| Validation     | class-validator / class-transformer |

---

##  Getting Started

### Prerequisites
- Node.js >= 18
- PostgreSQL >= 14
- npm

### Installation

```bash
git clone https://github.com/WalaHassine/fanzone-backend.git
cd fanzone-backend
npm install
cp .env.example .env
```

### Run

```bash
# development
npm run start:dev

# production
npm run build
npm run start:prod
```

The API runs on `http://localhost:3000` by default.


---

##  AI Recommendation

The recommendation endpoint scores fan zones using:

- the user's favorite team and the matches being shown
- distance from the user
- seat availability
- atmosphere preference
- number of fans of the same team already checked in

It returns the best fan zone plus a short explanation, for example:

```
Recommended fan zone: Cafe Mondial
Reason: It is close to your location, it is showing your favorite team's
match, many fans of your team are already checked in anonymously, and
seats are still available.
```

---



##  Testing

```bash
npm run test        # unit tests
npm run test:e2e    # end-to-end tests
npm run test:cov    # coverage
```

---


##  Author

**Wala Hassine** · [GitHub](https://github.com/WalaHassine)

