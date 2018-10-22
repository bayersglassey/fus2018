
#include "lexer.h"

char *DEFAULT_FILENAME = "<no file>";

void fus_lexer_init(fus_lexer_t *lexer, char *filename){
    lexer->chunk = NULL;
    lexer->chunk_size = 0;
    lexer->chunk_i = 0;

    lexer->filename = filename? filename: DEFAULT_FILENAME;
    lexer->pos = 0;
    lexer->row = 0;
    lexer->col = 0;

    lexer->indent = 0;

    lexer->token = NULL;
    lexer->token_len = 0;
    lexer->token_type = FUS_TOKEN_ERR;
}

void fus_lexer_reset(fus_lexer_t *lexer, char *filename){
    fus_lexer_cleanup(lexer);
    fus_lexer_init(lexer, filename);
}

void fus_lexer_cleanup(fus_lexer_t *lexer){
    if(lexer->filename != DEFAULT_FILENAME)free(lexer->filename);
}

void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_size
){
    if(lexer->token_type == FUS_TOKEN_SPLIT){
        /* Since caller passes us each chunk directly,
        we should probably have a "split token buffer" in which we
        save current token, then append to it from the new chunk?.. */
        fprintf(stderr, "%s: TODO: Handle \"split\" tokens\n", __func__);
        fprintf(stderr, "...token was: %.*s\n",
            lexer->token_len, lexer->token);
        exit(EXIT_FAILURE);
    }
    lexer->chunk = chunk;
    lexer->chunk_size = chunk_size;
    lexer->chunk_i = 0;
}

bool fus_lexer_done(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_DONE;
}

bool fus_lexer_got(fus_lexer_t *lexer, const char *token){
    return lexer->token_len == strlen(token) &&
        strncmp(token, lexer->token, lexer->token_len);
}



/*************
 * DEBUGGING *
 *************/

#define FUS_LEXER_INFO(LEXER, F) { \
    fus_lexer_t *__lexer = (LEXER); \
    fprintf((F), "%s: row %i: col %i: ", \
        __lexer->filename, \
        __lexer->row + 1, \
        __lexer->col - __lexer->token_len + 1); \
}

#define FUS_LEXER_ERROR(LEXER) \
    fprintf(stderr, "%s: LEXER ERROR: ", __func__); \
    FUS_LEXER_INFO(LEXER, stderr)


/************************
 * LET THE LEXING BEGIN *
 ************************/

static int fus_lexer_peek(fus_lexer_t *lexer){
    /* Peek at next character. Only ever called after encountering
    '-' (when we need to determine whether we're lexing a negative number
    or an op) or ';' (when we need to determine whether we're lexing a
    string-till-end-of-line or an op). */

    if(lexer->chunk_i + 1 >= lexer->chunk_size){
        /* Return EOF to signal to caller that this is a split token. */
        return EOF;
    }
    return lexer->chunk[lexer->chunk_i + 1];
}

static char fus_lexer_eat(fus_lexer_t *lexer){
    /* Move lexer forward by 1 character.
    This should be the only way to do so.
    That way, we can be reasonably certain that
    pos, row, col are correct. */

    char c = lexer->chunk[lexer->chunk_i];
    lexer->chunk_i++;
    lexer->pos++;
    if(c == '\n'){
        lexer->row++;
        lexer->col = 0;
    }else{
        lexer->col++;
    }
    return c;
}

static int fus_lexer_eat_indent(fus_lexer_t *lexer){
    /* Eats the whitespace starting at beginning of a line,
    updating lexer->indent in the process.
    Returns lexer->indent, or -1 on failure. */
    int indent = 0;
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == ' '){
            indent++;
            fus_lexer_eat(lexer);
        }else if(c == '\n'){
            /* blank lines don't count towards indentation --
            just reset the indentation and restart on next line */
            indent = 0;
            fus_lexer_eat(lexer);
        }else if(c != '\0' && isspace(c)){
            FUS_LEXER_ERROR(lexer)
            fprintf(stderr, "Indented with whitespace other than ' ' "
                "(#32): #%i\n", (int)c);
            return -1;
        }else{
            break;
        }
    }
    lexer->indent = indent;
    return indent;
}

void fus_lexer_next(fus_lexer_t *lexer){
}
