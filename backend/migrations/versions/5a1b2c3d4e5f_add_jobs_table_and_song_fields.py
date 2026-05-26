"""add jobs table and missing song fields

Revision ID: 5a1b2c3d4e5f
Revises: 4176273b3f4a
Create Date: 2026-05-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5a1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = '4176273b3f4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add jobs table, raw_vocal_path, converted_vocal_path, svs_provider to songs."""
    # Create jobs table
    op.create_table('jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default=sa.text("'queued'")),
        sa.Column('progress', sa.Integer(), nullable=True, server_default=sa.text('0')),
        sa.Column('stage', sa.String(length=32), nullable=True),
        sa.Column('payload_json', sa.Text(), nullable=True),
        sa.Column('result_json', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('celery_task_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_jobs_id'), 'jobs', ['id'], unique=False)
    op.create_index(op.f('ix_jobs_user_id'), 'jobs', ['user_id'], unique=False)

    # Add missing song columns (SQLite supports ADD COLUMN for simple cases)
    op.add_column('songs', sa.Column('raw_vocal_path', sa.String(length=512), nullable=True, server_default=''))
    op.add_column('songs', sa.Column('converted_vocal_path', sa.String(length=512), nullable=True, server_default=''))
    op.add_column('songs', sa.Column('svs_provider', sa.String(length=32), nullable=True, server_default=''))


def downgrade() -> None:
    """Reverse: drop jobs table and song columns."""
    op.drop_column('songs', 'svs_provider')
    op.drop_column('songs', 'converted_vocal_path')
    op.drop_column('songs', 'raw_vocal_path')
    op.drop_index(op.f('ix_jobs_user_id'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_id'), table_name='jobs')
    op.drop_table('jobs')
