# clickstream-data-simulator-pg
This repository contains code that generates synthetic clickstream data for testing or analytical purposes. The simulated events are streamed and stored into a specified PostgreSQL endpoint.

🔧 Features
Configurable clickstream event generator

Real-time data simulation

Seamless PostgreSQL integration

🛠️ Usage
Set up PostgreSQL
Provide the connection details for your PostgreSQL instance.

Run the generator

python create_event.py --db-url postgresql://user:password@host:port/dbname

Customize simulation parameters (optional)

You can adjust the volume, user behavior patterns, event types, etc., through the config or command-line arguments.
