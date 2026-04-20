"""Initial migration

Revision ID: initial_001
Revises: 
Create Date: 2026-03-15 20:53:05.123456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = 'initial_001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable PostGIS
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis;')

    # Create devices table
    op.create_table(
        'devices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('device_type', sa.String(length=50), server_default='simulator', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )

    # Create telemetry_points table
    op.create_table(
        'telemetry_points',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('device_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('location', Geometry('POINT', srid=4326), nullable=False),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('speed', sa.Float(), nullable=True),
        sa.Column('heading', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('batch_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Create Indices
    op.create_index('idx_telemetry_location', 'telemetry_points', ['location'], postgresql_using='gist')
    op.create_index('idx_telemetry_device_time', 'telemetry_points', ['device_id', sa.text('recorded_at DESC')])


def downgrade() -> None:
    op.drop_index('idx_telemetry_device_time', table_name='telemetry_points')
    op.drop_index('idx_telemetry_location', table_name='telemetry_points', postgresql_using='gist')
    op.drop_table('telemetry_points')
    op.drop_table('devices')
    op.execute('DROP EXTENSION IF EXISTS postgis;')
