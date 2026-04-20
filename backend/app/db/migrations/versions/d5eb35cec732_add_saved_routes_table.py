"""add_saved_routes_table

Revision ID: d5eb35cec732
Revises: initial_001
Create Date: 2026-03-17 19:26:00.157826

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd5eb35cec732'
down_revision: Union[str, None] = 'initial_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('saved_routes',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('origin_name', sa.String(), nullable=False),
    sa.Column('destination_name', sa.String(), nullable=False),
    sa.Column('origin_lat', sa.Float(), nullable=False),
    sa.Column('origin_lng', sa.Float(), nullable=False),
    sa.Column('dest_lat', sa.Float(), nullable=False),
    sa.Column('dest_lng', sa.Float(), nullable=False),
    sa.Column('mode', sa.String(length=20), nullable=False),
    sa.Column('distance', sa.String(length=50), nullable=False),
    sa.Column('duration', sa.String(length=50), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('saved_routes')
