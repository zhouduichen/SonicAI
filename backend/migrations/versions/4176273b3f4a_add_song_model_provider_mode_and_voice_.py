"""add_song_model_provider_mode_and_voice_fix

Revision ID: 4176273b3f4a
Revises: 7770e39b21d6
Create Date: 2026-05-22 21:31:48.344099

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4176273b3f4a'
down_revision: Union[str, Sequence[str], None] = '7770e39b21d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add songs table, provider_mode, fix voice_models source field."""
    # Create new songs table
    op.create_table('songs',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('theme', sa.String(length=500), nullable=False),
    sa.Column('lyrics', sa.Text(), nullable=True),
    sa.Column('style_vector_id', sa.Integer(), nullable=True),
    sa.Column('voice_model_id', sa.Integer(), nullable=True),
    sa.Column('instrumental_path', sa.String(length=512), nullable=True),
    sa.Column('vocal_path', sa.String(length=512), nullable=True),
    sa.Column('mixed_path', sa.String(length=512), nullable=True),
    sa.Column('reference_vocal_path', sa.String(length=512), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('lyrics_provider', sa.String(length=32), nullable=True),
    sa.Column('instrumental_provider', sa.String(length=32), nullable=True),
    sa.Column('vocal_provider', sa.String(length=32), nullable=True),
    sa.Column('has_vocals', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['style_vector_id'], ['style_vectors.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['voice_model_id'], ['voice_models.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_songs_id'), 'songs', ['id'], unique=False)
    op.create_index(op.f('ix_songs_user_id'), 'songs', ['user_id'], unique=False)

    # Add provider_mode to generated_music
    op.add_column('generated_music', sa.Column('provider_mode', sa.String(length=16), nullable=True, server_default=sa.text("'mock'")))

    # Replace voice_models.source_audio_id (FK) with source_audio_ids (JSON string)
    # Use named_recreate to handle the constraint and column change in one batch
    with op.batch_alter_table('voice_models', recreate='always') as batch_op:
        batch_op.add_column(sa.Column('source_audio_ids', sa.String(length=1024), nullable=True))
        batch_op.drop_column('source_audio_id')


def downgrade() -> None:
    """Downgrade schema: reverse the above changes."""
    # Restore voice_models old column via batch mode
    with op.batch_alter_table('voice_models') as batch_op:
        batch_op.drop_column('source_audio_ids')
        batch_op.add_column(sa.Column('source_audio_id', sa.INTEGER(), nullable=True))
        batch_op.create_foreign_key(None, 'audio_assets', ['source_audio_id'], ['id'])

    op.drop_column('generated_music', 'provider_mode')
    op.drop_index(op.f('ix_songs_user_id'), table_name='songs')
    op.drop_index(op.f('ix_songs_id'), table_name='songs')
    op.drop_table('songs')
