#include "mymap.h"

Man::Man()
{
    setPos(290, 120);
}

QRectF Man::boundingRect() const
{
    return QRectF(-25,-25,50, 50 );
}

void Man::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    painter->drawImage(boundingRect(),QImage(":/new/ground/backGround/Map_man.png"));
}

QPainterPath Man::shape() const
{
    QPainterPath p;
    p.addEllipse(QPointF(25 / 2, 25 / 2), 10, 10);
    return p;
}

Arena::Arena(qreal x,qreal y)
{
    setPos(x,y);
}

QRectF Arena::boundingRect() const
{
    return QRectF(-40,-40,80,80);
}

void Arena::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{

    painter->drawImage(boundingRect(),QImage(":/new/ground/backGround/Map_Arena.png"));
}

QPainterPath Arena::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-40,-40,80,80));
    return p;
}

Gym::Gym(qreal x,qreal y)
{
    setPos(x,y);
}

QRectF Gym::boundingRect() const
{
    return QRectF(-40,-40,80,80);
}

void Gym::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    painter->drawImage(boundingRect(),QImage(":/new/ground/backGround/Map_Gym.png"));
}

QPainterPath Gym::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-40,-40,80,80));
    return p;
}

Music::Music(qreal x,qreal y)
{
    setPos(x,y);
}

QRectF Music::boundingRect() const
{
    return QRectF(-40,-40,80,80);
}

void Music::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    painter->drawImage(boundingRect(),QImage(":/new/ground/backGround/Map_Music.png"));
}

QPainterPath Music::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-40,-40,80,80));
    return p;
}

Exit::Exit(qreal x,qreal y)
{
    setPos(x,y);
}

QRectF Exit::boundingRect() const
{
    return QRectF(-40,-40,80,80);
}

void Exit::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    painter->drawImage(boundingRect(),QImage(":/new/ground/backGround/Map_Exit.png"));
}

QPainterPath Exit::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-40,-40,80,80));
    return p;
}

leftPoke::leftPoke(int i)
{
    setPos(170,250);
    which = i;
}

QRectF leftPoke::boundingRect() const
{
    return QRectF(-120,-120,240,240);
}

void leftPoke::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    QImage *img = new QImage;
    switch(which)
    {
    case 1:
        img->load(":/new/ground/backGround/L_Hitmonlee.png");
        break;
    case 2:
        img->load(":/new/ground/backGround/L_Charmander.png");
        break;
    case 3:
        img->load(":/new/ground/backGround/L_Squirtle.png");
        break;
    case 4:
        img->load(":/new/ground/backGround/L_Licktung.png");
        break;
    case 5:
        img->load(":/new/ground/backGround/L_Muk.png");
        break;
    case 6:
        img->load(":/new/ground/backGround/LR_Krabby.png");
        break;
    case 7:
        img->load(":/new/ground/backGround/L_Shellder.png");
        break;
    case 8:
        img->load(":/new/ground/backGround/L_Onix.png");
        break;
    case 9:
        img->load(":/new/ground/backGround/L_Geodude.png");
        break;
    case 10:
        img->load(":/new/ground/backGround/L_Bulbasaur.png");
        break;
    case 11:
        img->load(":/new/ground/backGround/L_Pidgeotto.png");
        break;
    default:
        img->load(":/new/ground/backGround/L_Pikachu.png");
        break;
    }
    painter->drawImage(boundingRect(),*img);
}

QPainterPath leftPoke::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-120,-120,240,240));
    return p;
}

rightPoke::rightPoke(int i)
{
    setPos(460,250);
    which = i;
}

QRectF rightPoke::boundingRect() const
{
    return QRectF(-120,-120,240,240);
}

void rightPoke::paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *)
{
    QImage *img = new QImage;
    switch(which)
    {
    case 1:
        img->load(":/new/ground/backGround/R_Hitmonlee.png");
        break;
    case 2:
        img->load(":/new/ground/backGround/R_Charmander.png");
        break;
    case 3:
        img->load(":/new/ground/backGround/R_Squirtle.png");
        break;
    case 4:
        img->load(":/new/ground/backGround/R_Licktung.png");
        break;
    case 5:
        img->load(":/new/ground/backGround/R_Muk.png");
        break;
    case 6:
        img->load(":/new/ground/backGround/LR_Krabby.png");
        break;
    case 7:
        img->load(":/new/ground/backGround/R_Shellder.png");
        break;
    case 8:
        img->load(":/new/ground/backGround/R_Onix.png");
        break;
    case 9:
        img->load(":/new/ground/backGround/R_Geodude.png");
        break;
    case 10:
        img->load(":/new/ground/backGround/R_Bulbasaur.png");
        break;
    case 11:
        img->load(":/new/ground/backGround/R_Pidgeotto.png");
        break;
    default:
        img->load(":/new/ground/backGround/R_Pikachu.png");
        break;
    }
    painter->drawImage(boundingRect(),*img);
}

QPainterPath rightPoke::shape() const
{
    QPainterPath p;
    p.addRect(QRectF(-120,-120,240,240));
    return p;
}
