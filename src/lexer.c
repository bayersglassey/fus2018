
#include "lexer.h"

char *DEFAULT_FILENAME = "<no file>";

const char *fus_lexer_token_type_msg(fus_lexer_token_type_t type){
    static const char *msgs[] = {
        "done",
        "error",
        "int",
        "sym",
        "str",
        "arr_open",
        "arr_close",
        "split"
    };
    if(type < 0 || type >= FUS_TOKENS)return "Unknown";
    return msgs[type];
}

const char *fus_lexer_errcode_msg(fus_lexer_errcode_t errcode){
    static const char *msgs[] = {
        "OK",
        "Indentation with whitespace other than ' '",
        "Reached end of line in str literal",
        "Too many indents",
        "Too few indents (impossible?!)",
        "Negative indent (what!)",
        "Something went wrong, idunno"
    };
    if(errcode < 0 || errcode >= FUS_LEXER_ERRCODES)return "Unknown";
    return msgs[errcode];
}


void fus_lexer_init(fus_lexer_t *lexer, char *filename){
    lexer->chunk = NULL;
    lexer->chunk_size = 0;
    lexer->chunk_i = 0;
    lexer->chunk_is_final = false;

    lexer->filename = filename? filename: DEFAULT_FILENAME;
    lexer->pos = 0;
    lexer->row = 0;
    lexer->col = 0;

    lexer->indent = 0;
    for(int i = 0; i < FUS_LEXER_MAX_INDENTS; i++)lexer->indents[i] = 0;
    lexer->n_indents = 0;
    lexer->returning_indents = 0;

    lexer->token = NULL;
    lexer->token_len = 0;
    lexer->token_type = FUS_TOKEN_ERROR;

    lexer->errcode = FUS_LEXER_ERRCODE_OK;
}

void fus_lexer_reset(fus_lexer_t *lexer, char *filename){
    fus_lexer_cleanup(lexer);
    fus_lexer_init(lexer, filename);
}

void fus_lexer_cleanup(fus_lexer_t *lexer){
    if(lexer->filename != DEFAULT_FILENAME)free(lexer->filename);
}

void fus_lexer_set_error(fus_lexer_t *lexer, fus_lexer_errcode_t errcode){
    /* NOTE: We preserve token and token_len, so that e.g. error messages
    can find start of token.
    But some kinds of errors can probably occur before we've started a
    token.
    So maybe we need 2 different set_error functions?..
    One of which sets token=NULL, token_len=0?.. */
    lexer->token_type = FUS_TOKEN_ERROR;
    lexer->errcode = errcode;
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

    fus_lexer_next(lexer);
}

void fus_lexer_mark_final(fus_lexer_t *lexer){
    lexer->chunk_is_final = true;
}

bool fus_lexer_is_ok(fus_lexer_t *lexer){
    return
        lexer->token_type != FUS_TOKEN_DONE &&
        lexer->token_type != FUS_TOKEN_SPLIT &&
        lexer->token_type != FUS_TOKEN_ERROR;
}

bool fus_lexer_is_done(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_DONE;
}

bool fus_lexer_is_split(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_SPLIT;
}

bool fus_lexer_is_error(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_ERROR;
}

bool fus_lexer_got(fus_lexer_t *lexer, const char *token){
    return lexer->token_len == strlen(token) &&
        !strncmp(token, lexer->token, lexer->token_len);
}



/*************
 * DEBUGGING *
 *************/

void fus_lexer_print_token(fus_lexer_t *lexer, FILE *file, bool print_type){
    fprintf(file, "%.*s", lexer->token_len, lexer->token);
    if(print_type){
        fprintf(file, " [%s]", fus_lexer_token_type_msg(lexer->token_type));
    }
}

void fus_lexer_pinfo(fus_lexer_t *lexer, FILE *file){
    int token_len = lexer->token_len;
    const char *dots = "";
    if(token_len > 10){token_len = 10; dots = "...";}
    fprintf(file, "%s: row %i: col %i: %s token \"%.*s\"%s",
        lexer->filename,
        lexer->row + 1,
        lexer->col - lexer->token_len + 1,
        fus_lexer_token_type_msg(lexer->token_type),
        token_len, lexer->token, dots);
}

void fus_lexer_perror(fus_lexer_t *lexer, const char *msg){
    fus_lexer_pinfo(lexer, stderr);
    const char *errcode_msg = fus_lexer_errcode_msg(lexer->errcode);
    if(msg)fprintf(stderr, ": %s (%s)\n", msg, errcode_msg);
    else fprintf(stderr, ": %s\n", errcode_msg);
}


/************************
 * LET THE LEXING BEGIN *
 ************************/

static void fus_lexer_start_token(fus_lexer_t *lexer){
    lexer->token = lexer->chunk + lexer->chunk_i;
    lexer->token_len = 0;
}

static void fus_lexer_end_token(fus_lexer_t *lexer){
    int token_startpos = lexer->token - lexer->chunk;
    lexer->token_len = lexer->chunk_i - token_startpos;
}

static void fus_lexer_set_token(fus_lexer_t *lexer,
    const char *token, int token_len
){
    lexer->token = token;
    lexer->token_len = token_len;
}

static char fus_lexer_peek(fus_lexer_t *lexer){
    /* Peek at next character. Only ever called after encountering
    '-' (when we need to determine whether we're lexing a negative number
    or an op) or ';' (when we need to determine whether we're lexing a
    string-till-end-of-line or an op). */
    if(lexer->chunk_i + 1 >= lexer->chunk_size)return '\0';
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
            fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_BAD_INDENT_CHAR);
            return -1;
        }else{
            break;
        }
    }
    lexer->indent = indent;
    return indent;
}

static void fus_lexer_eat_whitespace(fus_lexer_t *lexer){
    /* Eats the whitespace *not* at the start of a line
    (e.g. between tokens on the same line) */
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0' || isgraph(c))break;
        fus_lexer_eat(lexer);
    }
}

static void fus_lexer_eat_comment(fus_lexer_t *lexer){
    /* eat leading '#' */
    fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\n')break;
        fus_lexer_eat(lexer);
    }
}

static void fus_lexer_parse_sym(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c != '_' && !isalnum(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static void fus_lexer_parse_int(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* eat leading '-' if present */
    if(lexer->chunk[lexer->chunk_i] == '-')fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(!isdigit(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static void fus_lexer_parse_op(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '(' || c == ')' || c == ':' || c == '"' || c == '_'
            || !isgraph(c) || isalnum(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static int fus_lexer_parse_str(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* Include leading '"' */
    fus_lexer_eat(lexer);

    while(1){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0'){
            goto err_eof;
        }else if(c == '\n'){
            goto err_eol;
        }else if(c == '"'){
            fus_lexer_eat(lexer);
            break;
        }else if(c == '\\'){
            fus_lexer_eat(lexer);
            char c = lexer->chunk[lexer->chunk_i];
            if(c == '\0'){
                goto err_eof;
            }else if(c == '\n'){
                goto err_eol;
            }
        }
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
    return 0;
err_eol:
err_eof:
    fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_STR_UNFINISHED);
    return -1;
}

static void fus_lexer_parse_blockstr(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* Include leading ";;" */
    fus_lexer_eat(lexer);
    fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0'){
            break;
        }else if(c == '\n'){
            break;
        }
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static int fus_lexer_push_indent(fus_lexer_t *lexer, int indent){
    if(indent < 0){
        /* Wtf u doin, caller */
        fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_NEGATIVE_INDENT);
        return -1;
    }
    if(lexer->n_indents >= FUS_LEXER_MAX_INDENTS){
        fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_TOO_MANY_INDENTS);
        return -1;
    }
    lexer->indents[lexer->n_indents] = indent;
    lexer->n_indents++;
    return 0;
}

static int fus_lexer_pop_indent(fus_lexer_t *lexer){
    if(lexer->n_indents <= 0){
        /* Should never happen */
        fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_TOO_FEW_INDENTS);
        return -1;
    }
    lexer->n_indents--;
    int indent = lexer->indents[lexer->n_indents];
    if(indent < 0){
        /* Wtf were we doin, sorry caller */
        fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_NEGATIVE_INDENT);
        return -1;
    }
    lexer->indents[lexer->n_indents] = 0;
    return indent;
}

static int fus_lexer_finish_line(fus_lexer_t *lexer){
    /* Finish end of line / end of file.
    Handles the end of indented blocks. */

    if(fus_lexer_eat_indent(lexer) < 0)return -1;
    int new_indent = lexer->indent;
    while(lexer->n_indents > 0){
        int indent = lexer->indents[lexer->n_indents-1];
        if(new_indent <= indent){
            if(fus_lexer_pop_indent(lexer) < 0)return -1;

            /* Indentation is down past indent of last indented block,
            so emit a fake ")" */
            lexer->returning_indents--;

        }else break;
    }
    return 0;
}

void fus_lexer_next(fus_lexer_t *lexer){
    char c = '\0';

    /* Eat various kinds of whitespace */
    while(1){

        if(lexer->returning_indents){
            /* This loop may increase/decrease returning_indents
            by more than 1, but not both!
            Each of the various if-branches within the loop either calls
            fus_lexer_finish_line (which may decrease returning_indents
            by an arbitrary amount) or does returning_indents++. */
            break;
        }

        if(lexer->chunk_i >= lexer->chunk_size){
            /* End of chunk. DO NOT call fus_lexer_finish_line!
            We don't know whether or not we're at the end of a line,
            only that we're at the end of a chunk.
            The first char of the next chunk could be... 'a', for all
            we know. */
            break;
        }

        /* Look at next character */
        c = lexer->chunk[lexer->chunk_i];

        if(c == '\n' || c == '\0'){
            /* Finish end of line / end of file (possibly decreasing
            returning_indents) */
            if(c == '\n')fus_lexer_eat(lexer);
            if(fus_lexer_finish_line(lexer) < 0)goto err;
            if(c == '\0')break;
        }else if(isspace(c)){
            /* Eat whitespace */
            fus_lexer_eat_whitespace(lexer);
        }else if(c == '#'){
            /* Eat comment */
            fus_lexer_eat_comment(lexer);
        }else if(c == ':'){
            /* Start new indented block (increasing returning_indents) */
            fus_lexer_eat(lexer);
            lexer->returning_indents++;
            if(fus_lexer_push_indent(lexer, lexer->indent) < 0)goto err;
        }else break;
    }

    /* Return fake "(" and ")" before anything else */
    if(lexer->returning_indents){
        if(lexer->returning_indents > 0){
            lexer->returning_indents--;
            lexer->token = "(";
            lexer->token_len = 1;
            lexer->token_type = FUS_TOKEN_ARR_OPEN;
        }else{
            lexer->returning_indents++;
            lexer->token = ")";
            lexer->token_len = 1;
            lexer->token_type = FUS_TOKEN_ARR_CLOSE;
        }
        goto ok;
    }

    if(lexer->chunk_i >= lexer->chunk_size){
        if(lexer->chunk_is_final){
            /* We're at end of chunk after having processed nothing but
            whitespace. So we declare success! */
            lexer->token = NULL;
            lexer->token_len = 0;
            lexer->token_type = FUS_TOKEN_DONE;
        }else{
            /* We're at end of chunk after having processed nothing but
            whitespace. So we clear the token: it's "split" in the sense
            that we need another chunk, but we should start that new
            chunk by just continuing to lex whitespace. */
            lexer->token = NULL;
            lexer->token_len = 0;
            lexer->token_type = FUS_TOKEN_SPLIT;
        }
    }else if(c == '(' || c == ')'){
        fus_lexer_start_token(lexer);
        fus_lexer_eat(lexer);
        fus_lexer_end_token(lexer);
        lexer->token_type = c == '('? FUS_TOKEN_ARR_OPEN: FUS_TOKEN_ARR_CLOSE;
    }else if(c == '_' || isalpha(c)){
        fus_lexer_parse_sym(lexer);
        lexer->token_type = FUS_TOKEN_SYM;
    }else if(isdigit(c) || (
        c == '-' && isdigit(fus_lexer_peek(lexer))
    )){
        fus_lexer_parse_int(lexer);
        lexer->token_type = FUS_TOKEN_INT;
    }else if(c == '"'){
        if(fus_lexer_parse_str(lexer) < 0)goto err;
        lexer->token_type = FUS_TOKEN_STR;
    }else if(c == ';' && fus_lexer_peek(lexer) == ';'){
        fus_lexer_parse_blockstr(lexer);
        lexer->token_type = FUS_TOKEN_STR;
    }else if(c == '\0'){
        lexer->token = NULL;
        lexer->token_len = 0;
        lexer->token_type = FUS_TOKEN_DONE;
    }else{
        fus_lexer_parse_op(lexer);
        lexer->token_type = FUS_TOKEN_SYM;
    }

    if(lexer->chunk_i >= lexer->chunk_size && !lexer->chunk_is_final){
        /* If we hit end of chunk, signal split token.
        We leave lexer->token, lexer->token_len alone, because
        they are the first half of the split token. */
        lexer->token_type = FUS_TOKEN_SPLIT;
    }

ok:
    if(0){
        printf("TOKEN: %.*s (%s)\n",
            lexer->token_len, lexer->token,
            fus_lexer_token_type_msg(lexer->token_type));
    }
err:
    return;
}
