"""add_telemetry_points_archive

Revision ID: 12ab34cd56ef
Revises: d5eb35cec732
Create Date: 2026-04-14 12:56:00.000000

"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = '12ab34cd56ef'
down_revision = 'd5eb35cec732'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create telemetry_points_archive table
    op.create_table('telemetry_points_archive',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('device_id', sa.UUID(), nullable=False),
        sa.Column('location', Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=False),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('speed', sa.Float(), nullable=True),
        sa.Column('heading', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('batch_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('ix_telemetry_archive_device_id', 'telemetry_points_archive', ['device_id'], unique=False)
    op.create_index('ix_telemetry_archive_recorded_at', 'telemetry_points_archive', ['recorded_at'], unique=False)

def downgrade() -> None:
    op.drop_index('ix_telemetry_archive_recorded_at', table_name='telemetry_points_archive')
    op.drop_index('ix_telemetry_archive_device_id', table_name='telemetry_points_archive')
    op.drop_table('telemetry_points_archive')
