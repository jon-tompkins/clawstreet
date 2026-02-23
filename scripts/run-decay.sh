#!/bin/bash
cd /home/ubuntu/clawstreet
node scripts/daily-decay.js >> /home/ubuntu/clawstreet/logs/decay.log 2>&1
